import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { RECEIPT_MODEL, IMAGE_RECEIPT_PROMPT, callClaude, parseClaudeJson, splitReceiptLines } from '../_shared/receipt.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64, mimeType } = await req.json()

    if (!imageBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 and mimeType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: claudeData, error: claudeError } = await callClaude(apiKey, {
      model: RECEIPT_MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: IMAGE_RECEIPT_PROMPT },
        ],
      }],
    })

    if (claudeError) {
      console.error('Anthropic API error:', claudeError)
      return new Response(
        JSON.stringify({ error: `AI parsing failed: ${claudeError}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let parsed
    try {
      parsed = parseClaudeJson(claudeData)
    } catch (parseErr) {
      const text = claudeData.content?.[0]?.text ?? ''
      console.error('JSON parse failed. Raw text:', text)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response as JSON', raw: text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { items, discounts } = splitReceiptLines(parsed)
    const store_name = parsed.store_name ?? null
    const purchase_date = parsed.purchase_date ?? null

    return new Response(
      JSON.stringify({ items, discounts, store_name, purchase_date }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unhandled error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
