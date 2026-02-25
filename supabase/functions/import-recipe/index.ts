import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_UNITS = new Set([
  'count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml',
  'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch',
])

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), { headers: CORS, status: 400 })
    }

    // Fetch the recipe page
    let html = ''
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
      })
      html = await pageRes.text()
    } catch (fetchErr) {
      return new Response(JSON.stringify({ error: `Could not fetch URL: ${fetchErr.message}` }), { headers: CORS, status: 422 })
    }

    // Strip scripts, styles, and tags to get readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 18000)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { headers: CORS, status: 500 })
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
          content: `Extract the recipe from this webpage text and return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "name": "recipe title",
  "total_servings": 4,
  "instructions": "full step-by-step instructions as a single string",
  "notes": "any tips or notes, or null",
  "ingredients": [
    { "name": "ingredient name", "quantity": 1, "unit": "tsp" }
  ]
}

Rules for ingredients:
- quantity must be a number (use 0.25 for 1/4, 0.5 for 1/2, 0.33 for 1/3)
- unit must be one of: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar, tsp, tbsp, pinch
- if no clear unit, use "count"
- ingredient name should not include the quantity or unit

Webpage text:
${text}`,
        }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      return new Response(JSON.stringify({ error: `AI parsing failed: ${err}` }), { headers: CORS, status: 502 })
    }

    const claudeData = await claudeRes.json()
    const raw = claudeData.content?.[0]?.text ?? ''

    let recipe
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      recipe = JSON.parse(jsonMatch?.[0] ?? raw)
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse recipe from page. Try a different recipe site.' }), { headers: CORS, status: 422 })
    }

    // Normalize units
    recipe.ingredients = (recipe.ingredients ?? []).map(ing => ({
      ...ing,
      quantity: Number(ing.quantity) || 1,
      unit: VALID_UNITS.has(ing.unit) ? ing.unit : 'count',
    }))

    recipe.source_url = url
    recipe.total_servings = Number(recipe.total_servings) || 4

    return new Response(JSON.stringify({ recipe }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: CORS, status: 500 })
  }
})
