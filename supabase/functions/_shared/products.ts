// Product enrichment for receipt items: barcode normalization, package size / pack count,
// unit price, and nutrition looked up from Open Food Facts and USDA FoodData Central.
// Results are cached in the product_catalog table so repeat purchases need no lookups.

const USER_AGENT = 'HouseholdPantryApp/1.0 (receipt import)'
const LOOKUP_TIMEOUT_MS = 8000
const NOT_FOUND_RETRY_DAYS = 30
const LOOKUP_CONCURRENCY = 4

// ---------- text cleanup ----------

// Receipts sometimes contain Cyrillic look-alike letters (e.g. "Ноt" with Cyrillic Н and о)
const CONFUSABLES: Record<string, string> = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
}

export function cleanText(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const out = s.replace(/[А-Яа-яЁёІіЈјЅѕ]/g, ch => CONFUSABLES[ch] ?? ch).replace(/\s+/g, ' ').trim()
  return out || null
}

// ---------- barcodes ----------

function checkDigit(body: string): number {
  // GTIN check digit: weights 3,1,3,1... from the rightmost digit of the body
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i])
    sum += i % 2 === 0 ? d * 3 : d
  }
  return (10 - (sum % 10)) % 10
}

function hasValidCheck(code: string): boolean {
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1])
}

// ShopRite digital receipts print the UPC without its leading zero and check digit
// (e.g. 60265228030 -> 602652280306). Returns a 12-digit UPC-A / 13-digit EAN, or null.
export function normalizeUpc(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 6) return null // PLU codes (e.g. 4011 bananas) aren't barcodes
  if (digits.length <= 11) {
    const body = digits.padStart(11, '0')
    if (body.startsWith('2')) return null // in-store random-weight labels
    return body + checkDigit(body)
  }
  if (digits.length === 12 || digits.length === 13) {
    if (hasValidCheck(digits)) return digits
    if (digits.length === 12 && digits.startsWith('0')) {
      const body = digits.slice(1)
      return body + checkDigit(body)
    }
    return null
  }
  if (digits.length === 14 && hasValidCheck(digits)) return digits.replace(/^0+/, '').padStart(12, '0')
  return null
}

const stripZeros = (s: string) => s.replace(/^0+/, '')

// ---------- units ----------

const UNIT_ALIASES: Record<string, string> = {
  oz: 'oz', ounce: 'oz', ounces: 'oz', onz: 'oz',
  'fl oz': 'fl oz', floz: 'fl oz', 'fl. oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', grm: 'g', gm: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', mlt: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', ltr: 'l',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
}

export function normalizePackageUnit(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const key = u.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ')
  return UNIT_ALIASES[key] ?? null
}

// Weight in oz, or volume in fl oz
const TO_OZ: Record<string, number> = { oz: 1, lb: 16, g: 0.035274, kg: 35.274, 'fl oz': 1, ml: 0.033814, l: 33.814, gal: 128 }
const IS_VOLUME = new Set(['fl oz', 'ml', 'l', 'gal'])

// Pantry units the rest of the app understands (see src/hooks/useUnitConversions.js)
const PANTRY_UNIT: Record<string, string> = { oz: 'oz', 'fl oz': 'oz', lb: 'lbs', g: 'g', kg: 'kg', ml: 'ml', l: 'liters', gal: 'gallons' }

function parseSizeText(text: unknown): { size: number; unit: string } | null {
  if (typeof text !== 'string') return null
  const m = text.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|onz|lbs?|g|grm|kg|ml|mlt|l|ltr|gal)\b/i)
  if (!m) return null
  const unit = normalizePackageUnit(m[2].replace(/\.\s*/, ' '))
  return unit ? { size: Number(m[1]), unit } : null
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

// ---------- lookups ----------

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

type CatalogRow = Record<string, any>

async function lookupOpenFoodFacts(upc: string): Promise<CatalogRow | null> {
  const fields = 'code,product_name,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutriments,image_front_small_url'
  const ean = upc.length === 12 ? `0${upc}` : upc
  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${fields}`)
  if (!data || data.status !== 1 || !data.product) return null
  const p = data.product
  const n = p.nutriments ?? {}
  const servingG = num(p.serving_quantity)

  // Per-serving value, falling back to per-100g scaled to the serving size
  const per = (key: string, factor = 1) => {
    const serving = num(n[`${key}_serving`])
    if (serving !== null) return round(serving * factor, 1)
    const per100 = num(n[`${key}_100g`])
    return per100 !== null && servingG ? round((per100 * servingG / 100) * factor, 1) : null
  }

  let size = num(p.product_quantity)
  let unit = normalizePackageUnit(p.product_quantity_unit)
  if (!size || !unit) {
    const parsed = parseSizeText(p.quantity)
    size = parsed?.size ?? null
    unit = parsed?.unit ?? null
  }

  return {
    name: cleanText(p.product_name),
    brand: cleanText(p.brands?.split(',')[0]),
    package_size: size,
    package_unit: unit,
    serving_size: cleanText(p.serving_size),
    serving_grams: servingG,
    calories: per('energy-kcal'),
    protein: per('proteins'),
    carbohydrates: per('carbohydrates'),
    fat: per('fat'),
    saturated_fat: per('saturated-fat'),
    fiber: per('fiber'),
    sugar: per('sugars'),
    sodium: per('sodium', 1000), // g -> mg
    image_url: p.image_front_small_url ?? null,
    source: 'openfoodfacts',
    source_id: p.code ?? ean,
  }
}

// USDA nutrient numbers -> our columns
const USDA_NUTRIENTS: Record<number, string> = {
  1008: 'calories', 1003: 'protein', 1005: 'carbohydrates', 1004: 'fat',
  1258: 'saturated_fat', 1079: 'fiber', 2000: 'sugar', 1093: 'sodium',
}

function usdaToRow(food: any): CatalogRow {
  // Branded food nutrients are reported per 100 g (or 100 ml); scale to the labelled serving
  const servingSize = num(food.servingSize)
  const servingUnit = String(food.servingSizeUnit ?? '').toLowerCase()
  const servingG = servingSize && ['g', 'grm', 'ml', 'mlt'].includes(servingUnit) ? servingSize : null
  const row: CatalogRow = {
    name: cleanText(food.description),
    brand: cleanText(food.brandName ?? food.brandOwner),
    serving_size: cleanText(food.householdServingFullText)
      ? `${cleanText(food.householdServingFullText)}${servingG ? ` (${servingG} ${servingUnit.startsWith('m') ? 'ml' : 'g'})` : ''}`
      : (servingG ? `${servingG} ${servingUnit.startsWith('m') ? 'ml' : 'g'}` : null),
    serving_grams: servingG,
    source: 'usda',
    source_id: String(food.fdcId),
  }
  for (const nutrient of food.foodNutrients ?? []) {
    const col = USDA_NUTRIENTS[nutrient.nutrientId]
    const value = num(nutrient.value)
    if (col && value !== null && servingG) row[col] = round(value * servingG / 100, 1)
  }
  const pkg = parseSizeText(food.packageWeight)
  if (pkg) {
    row.package_size = pkg.size
    row.package_unit = pkg.unit
  }
  return row
}

async function lookupUsda(upc: string, apiKey: string | undefined): Promise<CatalogRow | null> {
  if (!apiKey) return null
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${upc}&dataType=Branded&pageSize=10&api_key=${apiKey}`
  const data = await fetchJson(url)
  const match = (data?.foods ?? []).find((f: any) => f.gtinUpc && stripZeros(String(f.gtinUpc)) === stripZeros(upc))
  return match ? usdaToRow(match) : null
}

const SIGNIFICANT = (s: string) => new Set(
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'with', 'oz', 'count', 'pack'].includes(w))
)

// Name search for items with no barcode (e.g. photo receipts). Only accepts a close match.
async function lookupUsdaByName(name: string, apiKey: string | undefined): Promise<CatalogRow | null> {
  if (!apiKey || !name) return null
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&dataType=Branded&pageSize=5&api_key=${apiKey}`
  const data = await fetchJson(url)
  const wanted = SIGNIFICANT(name)
  if (wanted.size === 0) return null
  for (const food of data?.foods ?? []) {
    const have = SIGNIFICANT(`${food.brandName ?? food.brandOwner ?? ''} ${food.description ?? ''}`)
    const overlap = [...wanted].filter(w => have.has(w)).length
    if (overlap / wanted.size >= 0.75) return usdaToRow(food)
  }
  return null
}

const NUTRITION_COLS = ['calories', 'protein', 'carbohydrates', 'fat', 'saturated_fat', 'fiber', 'sugar', 'sodium']

function merge(primary: CatalogRow | null, fallback: CatalogRow | null): CatalogRow | null {
  if (!primary) return fallback
  if (!fallback) return primary
  const out: CatalogRow = { ...primary }
  // Nutrition comes as a set from one source so serving size and values stay consistent
  if (out.calories == null && fallback.calories != null) {
    for (const col of [...NUTRITION_COLS, 'serving_size', 'serving_grams']) out[col] = fallback[col] ?? null
  }
  for (const [k, v] of Object.entries(fallback)) {
    if (out[k] == null && v != null) out[k] = v
  }
  out.source = `${primary.source}+${fallback.source}`
  return out
}

function isComplete(row: CatalogRow | null) {
  return !!row && row.calories != null && row.package_size != null
}

// ---------- per-item finalization ----------

// Works out pantry quantity/unit and unit price from receipt + catalog data.
export function finalizeItem(item: any, catalog: CatalogRow | null) {
  const bought = num(item.quantity) ?? 1
  const price = num(item.price)
  let packageSize = num(item.package_size)
  let packageUnit = normalizePackageUnit(item.package_unit)
  const packCount = num(item.pack_count) && num(item.pack_count)! > 1 ? num(item.pack_count) : (num(catalog?.pack_count) ?? null)

  if ((!packageSize || !packageUnit) && catalog?.package_size && catalog?.package_unit) {
    packageSize = num(catalog.package_size)
    packageUnit = normalizePackageUnit(catalog.package_unit)
    // Catalog sizes are for the whole package; convert to one piece for multi-packs
    if (packageSize && packCount) packageSize = round(packageSize / packCount, 3)
  }

  let quantity = bought
  let unit = item.unit ?? 'count'
  let unitPrice: number | null = null
  let unitPriceUnit: string | null = null
  const soldByWeight = ['lb', 'lbs'].includes(String(item.unit).toLowerCase())

  if (soldByWeight) {
    unit = 'lbs'
    unitPrice = num(item.price_per_lb) ?? (price && bought ? round(price / bought) : null)
    unitPriceUnit = unitPrice ? 'lb' : null
  } else if (packCount) {
    quantity = bought * packCount
    unit = 'count'
    if (price) { unitPrice = round(price / quantity); unitPriceUnit = 'each' }
  } else if (packageSize && packageUnit) {
    quantity = round(bought * packageSize, 3)
    unit = PANTRY_UNIT[packageUnit] ?? unit
    const totalOz = quantity * (TO_OZ[packageUnit] ?? 0)
    if (price && totalOz) {
      if (IS_VOLUME.has(packageUnit)) { unitPrice = round(price / totalOz, 3); unitPriceUnit = 'fl oz' }
      else { unitPrice = round(price / (totalOz / 16)); unitPriceUnit = 'lb' }
    }
  } else if (price && bought > 1) {
    unitPrice = round(price / bought); unitPriceUnit = 'each'
  }

  return {
    quantity,
    unit,
    package_size: packageSize,
    package_unit: packageUnit,
    pack_count: packCount,
    unit_price: unitPrice,
    unit_price_unit: unitPriceUnit,
  }
}

// ---------- batch enrichment ----------

function productKeyFor(item: any): { key: string; upc: string | null; name: string | null } | null {
  const upc = normalizeUpc(item.upc)
  if (upc) return { key: `upc:${upc}`, upc, name: null }
  const name = cleanText(item.brand_name ?? item.scanned_name)
  const norm = name?.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  return norm ? { key: `name:${norm}`, upc: null, name } : null
}

async function mapLimit<T, R>(list: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++
      out[i] = await fn(list[i])
    }
  }))
  return out
}

// Enriches receipt items in place-safe fashion; returns new item objects with
// product_key, upc and the finalize fields added. Never throws for lookup failures.
export async function enrichItems(supabase: any, items: any[]): Promise<any[]> {
  const usdaKey = Deno.env.get('fdc_nal_usda_gov_api_key') ?? Deno.env.get('FDC_NAL_USDA_GOV_API_KEY')
  const keys = items.map(productKeyFor)
  const uniqueKeys = [...new Set(keys.filter(Boolean).map(k => k!.key))]

  const cached = new Map<string, CatalogRow>()
  if (uniqueKeys.length) {
    const { data } = await supabase.from('product_catalog').select('*').in('product_key', uniqueKeys)
    const staleBefore = Date.now() - NOT_FOUND_RETRY_DAYS * 86_400_000
    for (const row of data ?? []) {
      if (row.lookup_status === 'found' || new Date(row.fetched_at).getTime() > staleBefore) cached.set(row.product_key, row)
    }
  }

  const toFetch = uniqueKeys.filter(k => !cached.has(k)).map(k => keys.find(x => x?.key === k)!)
  const fetched = await mapLimit(toFetch, LOOKUP_CONCURRENCY, async ({ key, upc, name }) => {
    let row: CatalogRow | null = null
    try {
      if (upc) {
        row = await lookupOpenFoodFacts(upc)
        if (!isComplete(row)) row = merge(row, await lookupUsda(upc, usdaKey))
      } else if (name) {
        row = await lookupUsdaByName(name, usdaKey)
      }
    } catch (err) {
      console.error('product lookup failed', key, (err as Error).message)
    }
    return {
      product_key: key,
      upc,
      ...(row ?? {}),
      lookup_status: row ? 'found' : 'not_found',
      fetched_at: new Date().toISOString(),
    }
  })

  if (fetched.length) {
    const { error } = await supabase.from('product_catalog').upsert(fetched, { onConflict: 'product_key' })
    if (error) console.error('product_catalog upsert failed:', error.message)
    else for (const row of fetched) cached.set(row.product_key, row)
  }

  return items.map((item, i) => {
    const k = keys[i]
    const catalog = k ? cached.get(k.key) ?? null : null
    const found = catalog?.lookup_status === 'found' ? catalog : null
    return {
      ...item,
      upc: k?.upc ?? null,
      // Only link rows that exist in the catalog (the FK requires it)
      product_key: catalog ? k!.key : null,
      ...finalizeItem(item, found),
      nutrition: found && found.calories != null ? {
        serving_size: found.serving_size,
        calories: found.calories,
        protein: found.protein,
        carbohydrates: found.carbohydrates,
        fat: found.fat,
      } : null,
    }
  })
}
