import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `Extract information from this grocery receipt and return ONLY a valid JSON object, no other text.

The object must have:
- store_name: string (the store name, e.g. "ShopRite of Mt. Laurel")
- purchase_date: string (ISO format YYYY-MM-DD, e.g. "2026-02-21")
- items: array of purchased food/grocery items

Each item in the array must have:
- name: string (full readable product name, expand abbreviations using the key below)
- quantity: number (default 1 if not shown)
- unit: string (count, lbs, oz, kg, etc.)
- price: number or null (the net price after any discounts — see rules below)
- category: one of: produce, dairy, meat, frozen, pantry, beverages, snacks, other

Abbreviation key (always expand these):
- SRBB = ShopRite Bowl & Basket (store brand)
- STRBK / STARBUCK = Starbucks
- HUNT TOM = Hunt's Tomatoes
- DCD = Diced
- CRM = Cream
- CHS = Cheese
- BRI = Brick
- ALM = Almond
- OAT = Oatmilk
- IC = Iced
- DK RST = Dark Roast
- VS = Bone-In (VS BONE IN = Bone-In)
- TH = Thighs
- GRK = Greek
- CBT = Chobani
- HF = Hillshire Farm
- SMKD = Smoked
- KEL = Kellogg's
- CHOCO = Chocolate
- PC = Pack
- WP = Weight Watchers / store equivalent
- ALM MILK = Almond Milk
- UNSWT = Unsweetened

IMPORTANT rules for discounts:
- Discount lines appear as negative prices, or lines labeled "Off", "On Sale", "Coupon", or "You Saved"
- Do NOT create a separate item for a discount line
- Instead, subtract the discount amount from the price of the item it applies to
- A discount line applies to the item immediately above it, or the item whose name it references
- Summary "You Saved $X" lines at the bottom are totals — ignore them (individual discounts are already applied above)
- Skip taxes, totals, balance, and non-food fees`,
            },
          ],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      console.error('Anthropic API error:', claudeRes.status, err)
      return new Response(
        JSON.stringify({ error: `AI parsing failed: ${err}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text ?? ''
    console.log('Claude raw response:', text)
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch (parseErr) {
      console.error('JSON parse failed. Raw text:', text)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response as JSON', raw: text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Support both old array format and new object format
    const items = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
    const store_name = parsed.store_name ?? null
    const purchase_date = parsed.purchase_date ?? null

    return new Response(
      JSON.stringify({ items, store_name, purchase_date }),
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
