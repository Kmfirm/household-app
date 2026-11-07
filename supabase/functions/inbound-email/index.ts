// Postmark inbound webhook: receives digital receipts forwarded from Gmail and adds them to the pantry.
// Deploy with --no-verify-jwt; requests are authenticated with ?secret=INBOUND_EMAIL_SECRET instead.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.97.0'
import { RECEIPT_MODEL, EMAIL_RECEIPT_PROMPT, callClaude, parseClaudeJson, splitReceiptLines } from '../_shared/receipt.ts'

const TOKEN_PATTERN = /\+([a-f0-9]{32})@/i
const MAX_BODY_CHARS = 100_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

// Gmail auto-forwarding keeps the original To header, so the token may only be in the envelope recipient
function findToken(email: any): string | null {
  if (email.MailboxHash && /^[a-f0-9]{32}$/i.test(email.MailboxHash)) return email.MailboxHash.toLowerCase()
  const candidates = [
    email.OriginalRecipient,
    ...(email.ToFull ?? []).map((t: any) => t.Email),
    ...(email.CcFull ?? []).map((t: any) => t.Email),
    ...(email.BccFull ?? []).map((t: any) => t.Email),
  ]
  for (const addr of candidates) {
    const match = addr?.match(TOKEN_PATTERN)
    if (match) return match[1].toLowerCase()
  }
  return null
}

serve(async (req) => {
  const secret = Deno.env.get('INBOUND_EMAIL_SECRET')
  if (!secret || new URL(req.url).searchParams.get('secret') !== secret) {
    // 403 tells Postmark not to retry
    return json({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let logId: string | null = null

  try {
    const email = await req.json()

    const token = findToken(email)
    if (!token) return json({ ignored: 'no import token in recipient address' })

    const { data: address } = await supabase
      .from('email_import_addresses')
      .select('household_id, user_id')
      .eq('token', token)
      .maybeSingle()
    if (!address) return json({ ignored: 'unknown import token' })

    const fromAddress: string = email.FromFull?.Email ?? email.From ?? ''
    const subject: string = email.Subject ?? ''
    const headerMessageId = (email.Headers ?? []).find((h: any) => h.Name?.toLowerCase() === 'message-id')?.Value
    const messageId: string = headerMessageId ?? email.MessageID
    const bodyText = (email.HtmlBody ? htmlToText(email.HtmlBody) : (email.TextBody ?? '')).slice(0, MAX_BODY_CHARS)

    // Dedupe: Postmark retries on failure, and Gmail can forward the same message twice
    const { data: existing } = await supabase
      .from('inbound_emails')
      .select('id, status')
      .eq('message_id', messageId)
      .maybeSingle()
    if (existing && existing.status !== 'error') return json({ duplicate: true })

    const logRow = {
      household_id: address.household_id,
      message_id: messageId,
      from_address: fromAddress,
      subject,
      body_preview: bodyText.slice(0, 2000),
      status: 'processing',
      error: null,
    }
    if (existing) {
      await supabase.from('inbound_emails').update(logRow).eq('id', existing.id)
      logId = existing.id
    } else {
      const { data: inserted, error: insertError } = await supabase.from('inbound_emails').insert(logRow).select('id').single()
      if (insertError) throw new Error(insertError.message)
      logId = inserted.id
    }

    // Gmail sends a confirmation email when you add a forwarding address; keep it so the app can show the code
    if (fromAddress.toLowerCase() === 'forwarding-noreply@google.com') {
      await supabase.from('inbound_emails').update({ status: 'gmail_verification' }).eq('id', logId)
      return json({ status: 'gmail_verification' })
    }

    const attachments: any[] = email.Attachments ?? []
    const content: any[] = []
    for (const att of attachments.filter(a => a.ContentType === 'application/pdf').slice(0, 3)) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.Content } })
    }
    // Only send images when the email has almost no text, i.e. the receipt itself is an image (skips logos)
    if (bodyText.length < 500) {
      for (const att of attachments.filter(a => IMAGE_TYPES.has(a.ContentType)).slice(0, 3)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: att.ContentType, data: att.Content } })
      }
    }
    content.push({
      type: 'text',
      text: `${EMAIL_RECEIPT_PROMPT}\n\n--- EMAIL ---\nFrom: ${fromAddress}\nSubject: ${subject}\nDate: ${email.Date ?? ''}\n\n${bodyText}`,
    })

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('API key not configured')

    const { data: claudeData, error: claudeError } = await callClaude(apiKey, {
      model: RECEIPT_MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
    })
    if (claudeError) throw new Error(claudeError)

    const parsed = parseClaudeJson(claudeData)
    const { items } = splitReceiptLines(parsed)

    if (parsed.is_receipt === false || items.length === 0) {
      await supabase.from('inbound_emails').update({
        status: 'skipped',
        error: parsed.is_receipt === false ? 'Not a receipt' : 'No items found in email',
      }).eq('id', logId)
      return json({ status: 'skipped' })
    }

    const storeName = parsed.store_name ?? null
    const totalSpent = items.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0)

    const { data: receipt, error: receiptError } = await supabase.from('receipts').insert({
      household_id: address.household_id,
      created_by: address.user_id,
      store_name: storeName,
      purchase_date: parsed.purchase_date ?? new Date().toISOString().split('T')[0],
      total_spent: totalSpent > 0 ? totalSpent : null,
      source: 'email',
    }).select().single()
    if (receiptError) throw new Error(receiptError.message)

    const { error: itemsError } = await supabase.from('pantry_items').insert(items.map(item => ({
      household_id: address.household_id,
      created_by: address.user_id,
      name: item.name,
      brand_name: item.brand_name ?? null,
      scanned_name: item.scanned_name ?? null,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'count',
      category: item.category ?? 'other',
      storage_location: 'pantry',
      store_of_purchase: storeName,
      purchase_price: parseFloat(item.price) || null,
      receipt_reference_id: receipt.id,
    })))
    if (itemsError) {
      await supabase.from('receipts').delete().eq('id', receipt.id)
      throw new Error(itemsError.message)
    }

    await supabase.from('inbound_emails').update({ status: 'imported', receipt_id: receipt.id }).eq('id', logId)
    return json({ status: 'imported', items: items.length })
  } catch (err) {
    console.error('inbound-email error:', err.message)
    if (logId) await supabase.from('inbound_emails').update({ status: 'error', error: err.message }).eq('id', logId)
    // Non-200 makes Postmark retry later (e.g. if the AI service was overloaded)
    return json({ error: err.message }, 500)
  }
})
