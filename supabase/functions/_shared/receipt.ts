// Shared receipt parsing used by ocr-receipt (photos) and inbound-email (digital receipts)

export const RECEIPT_MODEL = 'claude-haiku-4-5-20251001'

const RECEIPT_INSTRUCTIONS = `The object must have:
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
  { "type": "discount", "amount": 0.60, "label": "On Sale" }`

export const IMAGE_RECEIPT_PROMPT = `Extract information from this grocery receipt and return ONLY a valid JSON object, no other text.

${RECEIPT_INSTRUCTIONS}`

export const EMAIL_RECEIPT_PROMPT = `Below is an email (and possibly attachments) that may contain a digital grocery receipt. Extract information from it and return ONLY a valid JSON object, no other text.

In addition to the fields below, the object must have:
- is_receipt: boolean (true only if this email contains an itemized purchase receipt; false for promotions, newsletters, account notices, etc. If false, return lines as an empty array)

${RECEIPT_INSTRUCTIONS}`

export async function callClaude(apiKey: string, body: unknown, retries = 2): Promise<{ data: any; error: string | null }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      return { data: await res.json(), error: null }
    }

    const errBody = await res.json().catch(() => ({}))
    const isOverloaded = errBody?.error?.type === 'overloaded_error'

    if (isOverloaded && attempt < retries) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }

    if (isOverloaded) {
      return { data: null, error: 'The AI service is busy right now. Please try again in a moment.' }
    }

    return { data: null, error: errBody?.error?.message ?? `Request failed (${res.status})` }
  }

  return { data: null, error: 'The AI service is busy right now. Please try again in a moment.' }
}

export function parseClaudeJson(claudeData: any): any {
  const text = claudeData.content?.[0]?.text ?? ''
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean)
}

// Walk lines in order, tracking item indices so discounts know which item they follow
export function splitReceiptLines(parsed: any) {
  const lines: any[] = Array.isArray(parsed) ? parsed : (parsed.lines ?? parsed.items ?? [])
  const items: any[] = []
  const discounts: any[] = []
  let lastItemIndex: number | null = null

  for (const line of lines) {
    if (line.type === 'discount') {
      discounts.push({
        label: line.label ?? 'Discount',
        amount: line.amount ?? 0,
        linked_to: lastItemIndex, // index into items array, matches React id assignment
      })
    } else {
      lastItemIndex = items.length
      items.push({
        ...line,
        name: line.generic_name ?? line.name,
      })
    }
  }

  return { items, discounts }
}
