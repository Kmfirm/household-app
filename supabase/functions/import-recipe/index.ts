import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_UNITS = new Set([
  'count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml',
  'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch',
])

// Find a Recipe object anywhere inside a parsed JSON value (recursive).
function findRecipeObject(obj: any, depth = 0): Record<string, any> | null {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findRecipeObject(item, depth + 1)
      if (found) return found
    }
    return null
  }
  // schema.org @type check
  const type = obj['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj
  // @graph wrapper
  if (obj['@graph']) {
    const found = findRecipeObject(obj['@graph'], depth + 1)
    if (found) return found
  }
  // Generic recipe-like object (Next.js / embedded state)
  if (obj.recipeIngredient?.length && obj.name) return obj
  // Recurse into child objects
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (val && typeof val === 'object') {
      const found = findRecipeObject(val, depth + 1)
      if (found) return found
    }
  }
  return null
}

// Extract schema.org Recipe from the raw HTML.
// Checks JSON-LD blocks first, then __NEXT_DATA__ (Next.js SSR apps).
function extractJsonLd(html: string): Record<string, any> | null {
  // 1. application/ld+json blocks
  const ldMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of ldMatches) {
    try {
      const found = findRecipeObject(JSON.parse(match[1]))
      if (found) return found
    } catch { /* skip */ }
  }
  // 2. Next.js __NEXT_DATA__ (server-side props embedded in the HTML)
  const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (nextMatch) {
    try {
      const found = findRecipeObject(JSON.parse(nextMatch[1]))
      if (found) return found
    } catch { /* skip */ }
  }
  return null
}

function formatInstructions(instructions: any): string {
  if (!instructions) return ''
  if (typeof instructions === 'string') return instructions
  if (Array.isArray(instructions)) {
    return instructions
      .map((step, i) => {
        const text = typeof step === 'string' ? step : (step.text ?? step.name ?? '')
        return `${i + 1}. ${text.trim()}`
      })
      .filter(s => s.length > 4)
      .join('\n')
  }
  return ''
}

function parseYield(yieldVal: any): number {
  if (!yieldVal) return 4
  const str = Array.isArray(yieldVal) ? String(yieldVal[0]) : String(yieldVal)
  const match = str.match(/\d+/)
  return match ? parseInt(match[0]) : 4
}

async function parseIngredientStrings(lines: string[], apiKey: string): Promise<any[]> {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Parse each ingredient line into a JSON array. Return ONLY a JSON array, no markdown, no explanation.

Format: [{ "name": "ingredient name only", "quantity": 1.5, "unit": "cups" }]

Rules:
- quantity must be a number (0.25 for 1/4, 0.5 for 1/2, 0.33 for 1/3, 0.75 for 3/4)
- unit must be one of: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar, tsp, tbsp, pinch
- name should be the ingredient only, without quantity or unit (e.g. "garlic cloves" not "3 garlic cloves")
- if no clear unit use "count"

Ingredient lines:
${lines.join('\n')}`,
      }],
    }),
  })

  if (!claudeRes.ok) return []
  const data = await claudeRes.json()
  const raw = data.content?.[0]?.text ?? ''
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match?.[0] ?? raw)
    return parsed.map((ing: any) => ({
      name: String(ing.name ?? '').trim(),
      quantity: Number(ing.quantity) || 1,
      unit: VALID_UNITS.has(ing.unit) ? ing.unit : 'count',
    })).filter((ing: any) => ing.name)
  } catch {
    return []
  }
}

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: JSON_HEADERS })
const err = (msg: string) => new Response(JSON.stringify({ error: msg }), { headers: JSON_HEADERS })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') return err('URL is required')

    // Fetch the page HTML with full browser headers to avoid bot detection
    let html = ''
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(15000),
      })
      html = await pageRes.text()
      console.log(`Fetched ${url} — status ${pageRes.status}, html length ${html.length}`)
    } catch (fetchErr: any) {
      return err(`Could not fetch URL: ${fetchErr.message}`)
    }

    // Detect bot-challenge pages (Cloudflare, etc.)
    if (
      html.includes('cf-chl-widget') ||
      html.includes('challenge-platform') ||
      html.includes('Checking your browser') ||
      html.includes('DDoS protection by Cloudflare') ||
      (html.length < 5000 && html.includes('Just a moment'))
    ) {
      return err('This site uses bot protection that blocked the import. Try a different recipe site such as AllRecipes, Food52, or Simply Recipes.')
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return err('API key not configured')

    // ── Path 1: JSON-LD structured data (works on JS-rendered sites) ──────────
    const jsonLd = extractJsonLd(html)
    console.log(`JSON-LD found: ${!!jsonLd}, name: ${jsonLd?.name ?? 'none'}, ingredients: ${jsonLd?.recipeIngredient?.length ?? 0}`)
    if (jsonLd && jsonLd.name && jsonLd.recipeIngredient?.length) {
      const ingredients = await parseIngredientStrings(jsonLd.recipeIngredient, apiKey)

      return ok({
        recipe: {
          name: String(jsonLd.name).trim(),
          total_servings: parseYield(jsonLd.recipeYield),
          instructions: formatInstructions(jsonLd.recipeInstructions),
          notes: jsonLd.description ? String(jsonLd.description).trim() : null,
          source_url: url,
          ingredients,
        }
      })
    }

    // ── Path 2: Full-text fallback (static sites without JSON-LD) ────────────
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 18000)

    if (!text.trim()) {
      return err('Page returned no readable content. The site likely requires JavaScript to load. Try a major recipe site like AllRecipes, Food52, or Serious Eats.')
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
          content: `Extract the recipe from this webpage text and return ONLY valid JSON (no markdown, no explanation):

{
  "name": "recipe title",
  "total_servings": 4,
  "instructions": "full numbered step-by-step instructions",
  "notes": "any tips or notes, or null",
  "ingredients": [
    { "name": "ingredient name only", "quantity": 1, "unit": "tsp" }
  ]
}

Ingredient rules:
- quantity must be a number (0.25 for 1/4, 0.5 for 1/2, 0.33 for 1/3)
- unit must be one of: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar, tsp, tbsp, pinch
- name must not include quantity or unit

Webpage text:
${text}`,
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      return err(`AI parsing failed: ${errText}`)
    }

    const claudeData = await claudeRes.json()
    const raw = claudeData.content?.[0]?.text ?? ''

    let recipe
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      recipe = JSON.parse(jsonMatch?.[0] ?? raw)
    } catch {
      return err('Could not parse recipe from page. Try a different recipe site.')
    }

    recipe.ingredients = (recipe.ingredients ?? []).map((ing: any) => ({
      ...ing,
      quantity: Number(ing.quantity) || 1,
      unit: VALID_UNITS.has(ing.unit) ? ing.unit : 'count',
    }))
    recipe.source_url = url
    recipe.total_servings = Number(recipe.total_servings) || 4

    return ok({ recipe })

  } catch (e: any) {
    return err(e.message ?? 'Unexpected error')
  }
})
