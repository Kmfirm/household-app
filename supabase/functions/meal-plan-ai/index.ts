// Meal plan AI assistant. Takes the chat so far plus the week's plan and recipe list
// (sent by the signed-in app), and returns a reply with *proposed* changes. It never
// writes to the database: the app shows the proposal and applies it after the user confirms.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@1.14.0'
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@1.14.0/helpers/beta/zod'
import { z } from 'npm:zod@4.6.7'

const MODEL = 'claude-opus-5-5'
const MAX_TURNS = 30
const MAX_CHARS = 4000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const Ingredient = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  category: z.string(),
})

const Action = z.object({
  type: z.enum(['create_recipe', 'add_meal', 'move_meal', 'update_meal', 'remove_meal']),
  summary: z.string(),
  // create_recipe: a short placeholder id (e.g. "new1") that add_meal can point to before the recipe exists
  recipe_ref: z.string().nullable(),
  // add_meal: an existing recipe id from the recipe list (or null when using recipe_ref)
  recipe_id: z.string().nullable(),
  // move_meal / update_meal / remove_meal: the id of an existing meal on the plan
  meal_id: z.string().nullable(),
  date: z.string().nullable(),
  meal_type: z.string().nullable(),
  scale: z.number().nullable(),
  cooked: z.boolean().nullable(),
  name: z.string().nullable(),
  total_servings: z.number().nullable(),
  instructions: z.string().nullable(),
  ingredients: z.array(Ingredient).nullable(),
})

const Response_ = z.object({
  reply: z.string(),
  actions: z.array(Action),
})

const SYSTEM_PROMPT = `You help a household manage its weekly meal plan inside a pantry and recipe app.

You never change anything yourself. You propose changes as "actions"; the app shows them to the user, who confirms before anything is saved. In "reply", talk to the user briefly and plainly (1-3 sentences): say what you'd change, or ask a question when the request is genuinely unclear. When you ask a question, return no actions.

Action rules:
- create_recipe: a new recipe. Set recipe_ref to a placeholder like "new1", plus name, total_servings, ingredients (each with name, quantity, unit, category) and optional short instructions. Use simple, generic ingredient names ("chicken thighs", "rice", "olive oil") so they match pantry items. Units: count, lbs, oz, g, kg, cups, tbsp, tsp, ml, liters. Categories: produce, dairy, meat, frozen, pantry, beverages, snacks, other. Prefer an existing recipe from the recipe list when one clearly matches instead of creating a duplicate.
- add_meal: put a recipe on the plan. Set date (YYYY-MM-DD), meal_type (lowercase, e.g. breakfast, lunch, dinner, or one of the household's extra rows), scale (1 unless asked; 0.5 or 2 etc. to halve/double), cooked (true only if the user says they already made/ate it), and either recipe_id (existing) or recipe_ref (a recipe created in this same response).
- move_meal: set meal_id plus the new date and/or meal_type.
- update_meal: set meal_id plus scale and/or cooked.
- remove_meal: set meal_id.
- Fields that don't apply to an action are null. Always write a short human-readable "summary" for each action, e.g. "Add Chicken Tacos to Tue Nov 24 dinner".
- Only use meal ids and recipe ids that appear in the context. Resolve relative dates ("tomorrow", "Thursday", "tonight") from today's date and the week shown. "Tonight" means today's dinner.
- Mark meals cooked only when the user says they made or ate them; the app subtracts ingredients from the pantry when a meal is marked cooked.`

const SLOT_PROMPT = `The user opened this chat from a specific slot on the planner (shown in the context as "slot"). They will describe a meal they're making or have made. Propose adding it to that slot unless they say otherwise: use an existing recipe if one matches, otherwise create the recipe (with reasonable ingredient quantities for the servings described) and add it. If they say they already made or ate it, set cooked to true.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'API key not configured' }, 500)

    const { mode, messages, context } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'messages are required' }, 400)

    const history: Anthropic.Beta.BetaMessageParam[] = messages
      .slice(-MAX_TURNS)
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    // The conversation must start with a user turn
    while (history.length && history[0].role !== 'user') history.shift()
    if (!history.length) return json({ error: 'messages are required' }, 400)

    const system = [
      SYSTEM_PROMPT,
      mode === 'slot' ? SLOT_PROMPT : '',
      `Current context (JSON):\n${JSON.stringify(context ?? {})}`,
    ].filter(Boolean).join('\n\n')

    const client = new Anthropic({ apiKey })
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      // If the model declines for safety reasons, the API retries on a fallback model automatically
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Response_) },
      system,
      messages: history,
    })

    if (response.stop_reason === 'refusal') {
      return json({ reply: "Sorry, I can't help with that one. Try rephrasing what you'd like to change.", actions: [] })
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      return json({ error: 'The AI response was cut off. Try a smaller request.' }, 502)
    }

    return json(response.parsed_output)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI service is busy right now. Please try again in a moment.' }, 429)
    }
    if (err instanceof Anthropic.APIError) {
      console.error('meal-plan-ai API error', err.status, err.message)
      return json({ error: `AI request failed (${err.status ?? 'network'})` }, 502)
    }
    console.error('meal-plan-ai error:', (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
