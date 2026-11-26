// Shared receipt parsing used by ocr-receipt (photos) and inbound-email (digital receipts)
import { cleanText } from './products.ts'

export const RECEIPT_MODEL = 'claude-haiku-4-5-20251001'

const RECEIPT_INSTRUCTIONS = `The object must have:
- store_name: string (the store name, e.g. "ShopRite of Mt. Laurel")
- purchase_date: string (ISO format YYYY-MM-DD, e.g. "2026-02-21")
- lines: array of ALL line entries in receipt order — both purchased items AND discount lines

Each entry in lines must have:
- type: "item" or "discount"

If type is "item":
- scanned_name: string (original text exactly as on receipt, e.g. "SRBB VS BONE IN TH")
- brand_name: string (full product name including brand, fully expanded, WITHOUT the size or count, e.g. "ShopRite Bowl & Basket Bone-In Chicken Thighs", "Kind Chewy Bars Variety Pack")
- generic_name: string (generic name with no brand and no size, e.g. "Bone-In Chicken Thighs", "Chewy Granola Bars")
- upc: string or null (the product code / UPC digits printed with the item, exactly as printed, e.g. "60265228030"; null if none)
- quantity: number (how many were bought, e.g. "2 × $2.99" means 2; for items sold by weight, the weight in lbs; default 1)
- unit: "count" for packaged items, or "lbs" for items sold by weight
- package_size: number or null (size of ONE package from the product name, e.g. 16 for "16 oz"; for multi-packs the size of one piece, e.g. 0.81 for "0.81 oz, 20 count"; convert "half gallon" to 64 with unit "fl oz", "gallon" to 128 "fl oz", "quart" to 32 "fl oz")
- package_unit: one of "oz", "fl oz", "lb", "g", "kg", "ml", "l", "gal", or null (use "fl oz" for liquids such as milk, juice, almondmilk)
- pack_count: number or null (pieces per package, e.g. 20 for "20 count", 6 for "6 pk"; null for single items)
- price: number or null (the line total paid for this line before discounts, e.g. "2 × $2.99 $5.98" means 5.98 — do NOT subtract discounts)
- price_per_lb: number or null (only for items sold by weight, if the price per lb is printed, e.g. "1.42 lb @ $3.99/lb" means 3.99)
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
  { "type": "item", "scanned_name": "HUNT TOM DCD FIRE PC", "brand_name": "Hunt's Diced Fire Roasted Tomatoes", "generic_name": "Diced Fire Roasted Tomatoes", "upc": null, "price": 1.69, "quantity": 1, "unit": "count", "package_size": null, "package_unit": null, "pack_count": null, "price_per_lb": null, "category": "pantry" }
  { "type": "discount", "amount": 1.67, "label": "Hunts or Rotel Off" }
  { "type": "item", "scanned_name": "SRBB CREAM CHS BRI", "brand_name": "ShopRite Bowl & Basket Cream Cheese Brick", "generic_name": "Cream Cheese Brick", "upc": null, "price": 1.69, "quantity": 1, "unit": "count", "package_size": null, "package_unit": null, "pack_count": null, "price_per_lb": null, "category": "dairy" }
  { "type": "discount", "amount": 0.60, "label": "On Sale" }

Example digital receipt item:
  Kind Chewy Bars Variety Pack, 0.81 oz, 20 count
  60265228030
  1 × $11.99
  $11.99 TF
Output:
  { "type": "item", "scanned_name": "Kind Chewy Bars Variety Pack, 0.81 oz, 20 count", "brand_name": "Kind Chewy Bars Variety Pack", "generic_name": "Chewy Granola Bars", "upc": "60265228030", "price": 11.99, "quantity": 1, "unit": "count", "package_size": 0.81, "package_unit": "oz", "pack_count": 20, "price_per_lb": null, "category": "snacks" }`

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
        scanned_name: cleanText(line.scanned_name),
        brand_name: cleanText(line.brand_name),
        name: cleanText(line.generic_name ?? line.name) ?? cleanText(line.brand_name) ?? 'Unknown item',
      })
    }
  }

  return { items, discounts }
}
