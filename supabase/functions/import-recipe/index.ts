import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_UNITS = new Set([
  'count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml',
  'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch',
])

// Extract schema.org Recipe from JSON-LD blocks in raw HTML.
// Most recipe sites embed this for SEO — it's reliable even on JS-rendered pages.
function extractJsonLd(html: string): Record<string, any> | null {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of matches) {
    try {
      const data = JSON.parse(match[1])
      const items: any[] = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data])
      for (const item of items) {
        const type = item['@type']
        if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
          return item
        }
      }
    } catch { /* malformed JSON-LD, skip */ }
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

    // Fetch the page HTML
    let html = ''
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      })
      html = await pageRes.text()
    } catch (fetchErr: any) {
      return err(`Could not fetch URL: ${fetchErr.message}`)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return err('API key not configured')

    // ── Path 1: JSON-LD structured data (works on JS-rendered sites) ──────────
    const jsonLd = extractJsonLd(html)
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

    if (text.length < 200) {
      return err('Could not read page content. The site may require JavaScript to load. Try copying the recipe URL directly from your browser.')
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
