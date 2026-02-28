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
- lines: array of ALL line entries in receipt order — both purchased items AND discount lines

Each entry in lines must have:
- type: "item" or "discount"

If type is "item":
- scanned_name: string (original text exactly as on receipt, e.g. "SRBB VS BONE IN TH")
- brand_name: string (fully expanded brand name, e.g. "ShopRite Bowl & Basket Bone-In Chicken Thighs")
- generic_name: string (generic name with no brand, e.g. "Bone-In Chicken Thighs")
- quantity: number (default 1)
- unit: string (count, lbs, oz, kg, etc.)
- price: number or null (the list price as printed — do NOT subtract discounts)
- category: one of: produce, dairy, meat, frozen, pantry, beverages, snacks, other

If type is "discount":
- amount: number (the positive discount value, e.g. 1.67)
- label: string (the text on the receipt, e.g. "Hunts or Rotel Off")

Abbreviation key (always expand these):
- SRBB = ShopRite Bowl & Basket (store brand)
- STRBK / STARBUCK = Starbucks
- HUNT TOM = Hunt's Tomatoes
- DCD = Diced, CRM = Cream, CHS = Cheese, BRI = Brick
- ALM = Almond, OAT = Oatmilk, IC = Iced, DK RST = Dark Roast
- VS BONE IN = Bone-In, TH = Thighs
- GRK = Greek, CBT = Chobani
- HF = Hillshire Farm, SMKD = Smoked
- KEL = Kellogg's, CHOCO = Chocolate, PC = Pack
- WP ALM MILK UNSWT = Unsweetened Almond Milk

What counts as a discount line (type: "discount"):
- Any line with a negative price or a trailing minus sign (e.g. "1.67-")
- Any line containing words like: Off, On Sale, Sale, Coupon, Savings, You Saved

What to skip entirely (do not include in lines at all):
- Summary "You Saved $X.XX" totals at the bottom
- Taxes, subtotals, totals, balance, fees, non-food items like bags

Example input lines on receipt:
  HUNT TOM DCD FIRE PC   1.69
  Hunts or Rotel Off     1.67-
  SRBB CREAM CHS BRI     1.69
  On Sale                0.60

Example output lines:
  { "type": "item", "scanned_name": "HUNT TOM DCD FIRE PC", "brand_name": "Hunt's Diced Fire Roasted Tomatoes", "generic_name": "Diced Fire Roasted Tomatoes", "price": 1.69, "quantity": 1, "unit": "count", "category": "pantry" }
  { "type": "discount", "amount": 1.67, "label": "Hunts or Rotel Off" }
  { "type": "item", "scanned_name": "SRBB CREAM CHS BRI", "brand_name": "ShopRite Bowl & Basket Cream Cheese Brick", "generic_name": "Cream Cheese Brick", "price": 1.69, "quantity": 1, "unit": "count", "category": "dairy" }
  { "type": "discount", "amount": 0.60, "label": "On Sale" }`,
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

    // Walk lines in order, applying each discount to the item immediately above it
    const lines: any[] = Array.isArray(parsed) ? parsed : (parsed.lines ?? parsed.items ?? [])
    const items: any[] = []
    let lastItem: any = null

    for (const line of lines) {
      if (line.type === 'discount') {
        if (lastItem) {
          lastItem.price = Math.max(0, Math.round(((lastItem.price ?? 0) - (line.amount ?? 0)) * 100) / 100)
        }
      } else {
        // item (or legacy format without type field)
        lastItem = {
          ...line,
          name: line.generic_name ?? line.name,
        }
        items.push(lastItem)
      }
    }

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
