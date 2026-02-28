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
- scanned_name: string (the original text exactly as it appears on the receipt, e.g. "SRBB VS BONE IN TH")
- brand_name: string (fully expanded brand product name, e.g. "ShopRite Bowl & Basket Bone-In Chicken Thighs")
- generic_name: string (the generic product name with no brand, e.g. "Bone-In Chicken Thighs" — used for recipe matching)
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
- Instead, subtract the discount from the price of the item immediately above it (or the item it references by name)
- The item's final price = item price - discount amount
- Summary "You Saved $X.XX" lines at the end are totals — skip them entirely
- Skip taxes, totals, balance, and non-food fees

Example of correct discount handling:
Receipt lines:
  HUNT TOM DCD FIRE PC   1.69
  Hunts or Rotel Off     1.67-
  SRBB CREAM CHS BRI     1.69
  On Sale                0.60

Correct output:
  { scanned_name: "HUNT TOM DCD FIRE PC", brand_name: "Hunt's Diced Fire Roasted Tomatoes", generic_name: "Diced Fire Roasted Tomatoes", price: 0.02 }
  { scanned_name: "SRBB CREAM CHS BRI", brand_name: "ShopRite Bowl & Basket Cream Cheese Brick", generic_name: "Cream Cheese Brick", price: 1.09 }

Wrong output (do NOT do this):
  { name: "Hunt's Diced Fire Roasted Tomatoes", price: 1.69 }
  { name: "Hunts or Rotel Off", price: -1.67 }   <-- NEVER output a discount as an item`,
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
    const rawItems = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
    // Normalise: map generic_name -> name for backward compat, keep brand_name + scanned_name
    const items = rawItems.map((item: any) => ({
      ...item,
      name: item.generic_name ?? item.name,
    }))
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
