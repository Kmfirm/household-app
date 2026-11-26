// Pantry AI: identifies grocery items from the user's text and/or photos and proposes
// pantry entries. It never writes to the database; the app shows the list for review
// and adds the items the user confirms.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@1.14.0'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.14.0/helpers/zod'
import { z } from 'npm:zod@4.6.7'

// Same cheap setup as the meal planner AI
const MODEL = 'claude-haiku-5-5'
const EFFORT = 'low'
const MAX_TURNS = 20
const MAX_CHARS = 4000
const MAX_IMAGES = 6
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const Item = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  category: z.string(),
  storage_location: z.string(),
  brand: z.string().nullable(),
  estimated_freshness_days: z.number().nullable(),
})

const Response_ = z.object({
  reply: z.string(),
  items: z.array(Item),
})

const SYSTEM_PROMPT = `You help a household add groceries to their pantry tracker. The user describes items in text and/or sends photos (loose produce, a fridge shelf, a grocery haul on the counter, a package label).

Return "reply" (1-3 short, plain sentences) and "items": the complete list of items to add, as it stands after this message. The context's "current_list" is the list the user is looking at right now, including any edits they made by hand; when they correct or add something in a follow-up, start from current_list and return the whole updated list, not just the change. Use names from "existing_pantry_items" when an item is clearly the same thing, so it matches what's already tracked. If the request is unclear (e.g. a blurry photo), say so in reply and return your best list or an empty one.

For each item:
- name: a simple generic name that will match recipe ingredients, e.g. "Bananas", "Red Bell Peppers", "Baby Spinach", "Greek Yogurt". Put brands in "brand" (null if unknown or unbranded produce).
- quantity and unit: count what you can see. Use unit "count" for countable things (5 apples, 3 avocados, 1 bunch of bananas -> count the bananas when visible), "lbs" or "oz" for things sold by weight with no clear count (a bag of grapes, loose green beans: estimate), and the package size for packaged goods when readable (e.g. 32 oz yogurt -> 32 "oz"). Allowed units: count, lbs, oz, g, kg, cups, liters, ml, gallons, dozen, bunch, bag, box, can, bottle, jar.
- category: one of the household's categories listed in the context; use "other" if none fits.
- storage_location: where it should be kept: one of pantry, fridge, freezer, counter, shelf, other (e.g. bananas and tomatoes -> counter, berries and leafy greens -> fridge).
- estimated_freshness_days: typical days until it should be used, stored as suggested, assuming it was just bought (e.g. bananas 5, strawberries 4, carrots 21, onions 30, dry pasta 365). Adjust down if a photo shows ripe or aging produce.

Only include food and grocery items. Never invent items you can't see or that weren't mentioned.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'API key not configured' }, 500)

    const { messages, context } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'messages are required' }, 400)

    // Keep only the most recent photos across the conversation
    let imageBudget = MAX_IMAGES
    const turns = messages.slice(-MAX_TURNS).reverse().map((m: any) => {
      const images = (Array.isArray(m.images) ? m.images : [])
        .filter((img: any) => IMAGE_TYPES.has(img?.mimeType) && typeof img?.data === 'string')
        .slice(0, Math.max(0, imageBudget))
      imageBudget -= images.length
      return { ...m, images }
    }).reverse()

    const history: Anthropic.MessageParam[] = []
    for (const m of turns) {
      if (m.role !== 'user' && m.role !== 'assistant') continue
      const text = typeof m.content === 'string' ? m.content.slice(0, MAX_CHARS) : ''
      if (m.role === 'assistant') {
        if (text.trim()) history.push({ role: 'assistant', content: text })
        continue
      }
      const content: Anthropic.ContentBlockParam[] = m.images.map((img: any) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.data },
      }))
      content.push({ type: 'text', text: text.trim() || 'Please identify the items in these photos.' })
      history.push({ role: 'user', content })
    }
    while (history.length && history[0].role !== 'user') history.shift()
    if (!history.length) return json({ error: 'messages are required' }, 400)

    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Photos are re-sent with each follow-up; caching makes those re-reads cheap
      cache_control: { type: 'ephemeral' },
      output_config: { effort: EFFORT, format: zodOutputFormat(Response_) },
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        { type: 'text', text: `Context (JSON):\n${JSON.stringify(context ?? {})}` },
      ],
      messages: history,
    })

    console.log('pantry-ai usage', JSON.stringify({
      input: response.usage.input_tokens,
      cache_read: response.usage.cache_read_input_tokens,
      cache_write: response.usage.cache_creation_input_tokens,
      output: response.usage.output_tokens,
    }))

    if (response.stop_reason === 'refusal') {
      return json({ reply: "Sorry, I can't help with that one. Try a different photo or description.", items: [] })
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      return json({ error: 'The AI response was cut off. Try fewer items at once.' }, 502)
    }

    return json(response.parsed_output)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI service is busy right now. Please try again in a moment.' }, 429)
    }
    if (err instanceof Anthropic.APIError) {
      console.error('pantry-ai API error', err.status, err.message)
      return json({ error: `AI request failed (${err.status ?? 'network'})` }, 502)
    }
    console.error('pantry-ai error:', (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
