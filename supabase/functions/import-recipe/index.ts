import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_UNITS = new Set([
  'count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml',
  'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch',
])

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: JSON_HEADERS })
const err = (msg: string) => new Response(JSON.stringify({ error: msg }), { headers: JSON_HEADERS })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { text, source_url, imageBase64, mimeType } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return err('API key not configured')

    // ── Image / vision path (cookbook photo scan) ─────────────────────────────
    if (imageBase64 && mimeType) {
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
                text: `Extract the recipe from this cookbook photo and return ONLY valid JSON (no markdown, no explanation):

{
  "name": "recipe title",
  "total_servings": 4,
  "instructions": "full numbered step-by-step instructions as a single string",
  "notes": "any tips or notes, or null",
  "ingredients": [
    { "name": "ingredient name only", "quantity": 1, "unit": "tsp" }
  ]
}

Ingredient rules:
- quantity must be a number (0.25 for 1/4, 0.5 for 1/2, 0.33 for 1/3, 0.75 for 3/4)
- unit must be one of: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar, tsp, tbsp, pinch
- name must not include quantity or unit
- if no clear unit, use "count"`,
              },
            ],
          }],
        }),
      })

      if (!claudeRes.ok) {
        const errText = await claudeRes.text()
        return err(`Vision scan failed: ${errText}`)
      }

      const claudeData = await claudeRes.json()
      const raw = claudeData.content?.[0]?.text ?? ''
      let recipe
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        recipe = JSON.parse(jsonMatch?.[0] ?? raw)
      } catch {
        return err('Could not extract a recipe from the photo. Make sure the page shows ingredients and instructions clearly.')
      }

      recipe.ingredients = (recipe.ingredients ?? []).map((ing: any) => ({
        ...ing,
        quantity: Number(ing.quantity) || 1,
        unit: VALID_UNITS.has(ing.unit) ? ing.unit : 'count',
      }))
      recipe.total_servings = Number(recipe.total_servings) || 4
      recipe.source_url = null

      return ok({ recipe })
    }

    // ── Text / paste path ─────────────────────────────────────────────────────
    if (!text || typeof text !== 'string' || !text.trim()) {
      return err('Recipe text or image is required')
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
          content: `Extract the recipe from this text and return ONLY valid JSON (no markdown, no explanation):

{
  "name": "recipe title",
  "total_servings": 4,
  "instructions": "full numbered step-by-step instructions as a single string",
  "notes": "any tips, notes, or variations, or null",
  "ingredients": [
    { "name": "ingredient name only", "quantity": 1, "unit": "tsp" }
  ]
}

Ingredient rules:
- quantity must be a number (0.25 for 1/4, 0.5 for 1/2, 0.33 for 1/3, 0.75 for 3/4)
- unit must be one of: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar, tsp, tbsp, pinch
- name must not include the quantity or unit
- if no clear unit, use "count"

Recipe text:
${text.slice(0, 20000)}`,
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
      return err('Could not parse a recipe from the pasted text. Make sure you copied the full recipe including ingredients and instructions.')
    }

    recipe.ingredients = (recipe.ingredients ?? []).map((ing: any) => ({
      ...ing,
      quantity: Number(ing.quantity) || 1,
      unit: VALID_UNITS.has(ing.unit) ? ing.unit : 'count',
    }))
    recipe.total_servings = Number(recipe.total_servings) || 4
    recipe.source_url = source_url ?? null

    return ok({ recipe })

  } catch (e: any) {
    return err(e.message ?? 'Unexpected error')
  }
})
