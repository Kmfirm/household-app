// Planned leftovers: a "cook" meal on the plan can feed later leftover slots
// (meal_plans.leftover_of), and fridge leftovers can be placed on the plan
// (meal_plans.leftover_id). Leftover slots never touch the pantry or shopping list.
import { supabase } from './supabase'
import { deductForMeal } from './mealPlanActions'
import { restorePantryDeductions } from './pantryDeduction'
import { addDaysStr, daysBetween, fromDateStr, toDateStr } from '../hooks/useMealPlan'

const round1 = n => Math.round(n * 10) / 10

export const isLeftoverSlot = plan => !!plan?.is_leftover

export function mealName(plan) {
  return plan?.recipes?.name ?? plan?.leftover_name ?? 'Leftovers'
}

export function slotServings(plan, settings) {
  const s = Number(plan?.servings)
  return s > 0 ? s : Number(settings.servings_per_meal) || 2
}

export function shortDay(dateStr) {
  return fromDateStr(dateStr).toLocaleDateString('en-US', { weekday: 'short' })
}

export function slotLabel(plan) {
  return `${shortDay(plan.date)} ${plan.meal_type}`
}

// Servings budget for a cook: what it makes, who eats it, and what's left over
export function leftoverBudget(source, allPlans, settings) {
  const perRecipe = Number(source.recipes?.total_servings) || null
  const scale = Number(source.scale) || 1
  const makes = perRecipe ? round1(perRecipe * scale) : null
  const own = slotServings(source, settings)
  const slots = allPlans
    .filter(p => p.leftover_of === source.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  const planned = round1(slots.reduce((sum, p) => sum + slotServings(p, settings), 0))
  const spare = makes === null ? null : round1(makes - own - planned)
  // Smallest half-step scale that covers everyone
  let suggestedScale = null
  if (perRecipe && spare < 0) suggestedScale = Math.ceil(((own + planned) / perRecipe) * 2) / 2
  return { makes, own, planned, spare, slots, suggestedScale }
}

// Leftovers that could fill a meal on `dateStr`:
//  cooks: planned (or cooked) meals on or before that day, within the keep window, with their spare servings
//  fridge: fridge leftovers not past use-by, with servings not already planned
export function leftoverChoicesFor(dateStr, allPlans, leftovers, settings) {
  const keep = Number(settings.leftover_days) || 4
  const cooks = allPlans
    .filter(p => !isLeftoverSlot(p) && p.recipe_id && p.date <= dateStr && daysBetween(p.date, dateStr) <= keep)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(plan => ({ plan, spare: leftoverBudget(plan, allPlans, settings).spare }))
  const cookIds = new Set(cooks.map(c => c.plan.id))
  const fridge = (leftovers ?? [])
    .filter(l => !cookIds.has(l.source_meal_plan_id) && (!l.expiration_date || l.expiration_date >= dateStr))
    .map(row => {
      const planned = allPlans
        .filter(p => p.leftover_id === row.id && !p.cooked)
        .reduce((sum, p) => sum + slotServings(p, settings), 0)
      return { row, available: round1(Number(row.remaining_servings) - planned) }
    })
    .filter(f => f.available > 0)
  return { cooks, fridge }
}

// Problems with a leftover slot's timing. `fridge` is the linked leftovers row, if any.
export function leftoverWarnings(slot, { source, fridge, settings }) {
  const warnings = []
  if (source) {
    if (slot.date < source.date) warnings.push(`Planned before ${shortDay(source.date)}, when it's cooked`)
    else if (daysBetween(source.date, slot.date) > settings.leftover_days) {
      warnings.push(`${daysBetween(source.date, slot.date)} days after cooking; leftovers keep about ${settings.leftover_days}`)
    }
  }
  if (fridge?.expiration_date && slot.date > fridge.expiration_date) {
    warnings.push(`After its use-by date (${shortDay(fridge.expiration_date)})`)
  }
  return warnings
}

// The leftovers row a slot eats from: the fridge item it was planned from,
// or the leftovers its cook produced
export function fridgeRowFor(slot, leftovers) {
  if (slot.leftover_id) return leftovers.find(l => l.id === slot.leftover_id) ?? null
  if (slot.leftover_of) return leftovers.find(l => l.source_meal_plan_id === slot.leftover_of) ?? null
  return null
}

async function fetchRowFor(slot) {
  if (slot.leftover_id) {
    const { data } = await supabase.from('leftovers').select('*').eq('id', slot.leftover_id).maybeSingle()
    return data
  }
  if (slot.leftover_of) {
    const { data } = await supabase.from('leftovers').select('*').eq('source_meal_plan_id', slot.leftover_of)
      .order('created_at', { ascending: false }).limit(1)
    return data?.[0] ?? null
  }
  return null
}

// Marks a meal cooked/eaten (or undoes it) and keeps the pantry and fridge leftovers in step.
// Undoing a cook puts back what it took from the pantry and removes its fridge leftovers.
// Returns { deducted, skipped, mismatched, restored, notes } for the toast; mismatched lists
// ingredients whose pantry item is in a unit that couldn't be compared (see pantryDeduction).
export async function setMealCooked(plan, cooked, ctx) {
  const { householdId, userId, settings, conversions, updateMeal, allPlans } = ctx
  const notes = []
  let deducted = []
  let skipped = []
  let mismatched = []
  let restored = []

  if (isLeftoverSlot(plan)) {
    const servings = slotServings(plan, settings)
    const row = await fetchRowFor(plan)
    if (cooked) {
      if (row) {
        const left = round1(Number(row.remaining_servings) - servings)
        if (left <= 0) {
          await supabase.from('leftovers').delete().eq('id', row.id)
          notes.push(`That finishes the ${row.name}.`)
        } else {
          await supabase.from('leftovers').update({ remaining_servings: left }).eq('id', row.id)
          notes.push(`${left} serving${left !== 1 ? 's' : ''} of ${row.name} left.`)
        }
      } else if (plan.leftover_of) {
        notes.push("The original meal isn't marked cooked yet, so there were no leftovers to subtract from.")
      }
    } else if (row) {
      await supabase.from('leftovers').update({ remaining_servings: round1(Number(row.remaining_servings) + servings) }).eq('id', row.id)
    } else {
      // The leftovers were used up (and removed); put this slot's servings back
      const source = allPlans?.find(p => p.id === plan.leftover_of)
      const base = source?.date ?? toDateStr(new Date())
      const { data: created } = await supabase.from('leftovers').insert({
        household_id: householdId,
        created_by: userId,
        source_recipe_id: plan.recipe_id ?? null,
        source_meal_plan_id: plan.leftover_of ?? null,
        name: mealName(plan),
        remaining_servings: servings,
        expiration_date: addDaysStr(base, settings.leftover_days),
      }).select('id').single()
      if (created && !plan.leftover_of) await updateMeal(plan.id, { leftover_id: created.id })
    }
    const { error } = await updateMeal(plan.id, { cooked })
    if (error) throw error
    return { deducted, skipped, mismatched, restored, notes }
  }

  // A regular (cook) meal
  if (cooked) {
    ;({ deducted, skipped, mismatched } = await deductForMeal(householdId, plan, plan.recipes, conversions))
    // Remember what came out of the pantry so undo can put it back
    const pantry_deductions = deducted.map(d => ({
      id: d.id, name: d.name, unit: d.unit,
      amount: Math.round((Number(d.from) - Number(d.to)) * 1000) / 1000,
    }))
    const { error } = await updateMeal(plan.id, { cooked: true, pantry_deductions })
    if (error) throw error

    const { makes, own, planned } = leftoverBudget(plan, allPlans ?? [], settings)
    const extra = makes !== null ? round1(makes - own) : planned
    if (extra > 0) {
      const { data: existing } = await supabase.from('leftovers').select('id').eq('source_meal_plan_id', plan.id).limit(1)
      if (!existing?.length) {
        await supabase.from('leftovers').insert({
          household_id: householdId,
          created_by: userId,
          source_recipe_id: plan.recipe_id,
          source_meal_plan_id: plan.id,
          name: mealName(plan),
          remaining_servings: extra,
          expiration_date: addDaysStr(plan.date, settings.leftover_days),
        })
        notes.push(`${extra} serving${extra !== 1 ? 's' : ''} saved to Leftovers.`)
      }
    }
  } else {
    const saved = Array.isArray(plan.pantry_deductions) ? plan.pantry_deductions : null
    if (saved?.length) {
      const { restored: back, missing } = await restorePantryDeductions(saved)
      restored = back
      if (missing.length) notes.push(`No longer in the pantry, so not put back: ${missing.join(', ')}.`)
    } else if (!saved) {
      notes.push('This was marked cooked before undo could track the pantry, so pantry amounts were left as they are.')
    }
    const { error } = await updateMeal(plan.id, { cooked: false, pantry_deductions: null })
    if (error) throw error
    const { data: removed } = await supabase.from('leftovers').delete().eq('source_meal_plan_id', plan.id).select('id')
    if (removed?.length) notes.push('Removed its leftovers from the fridge.')
  }
  return { deducted, skipped, mismatched, restored, notes }
}

// Puts a fridge leftover on the plan (used outside the planner, e.g. the Leftovers page)
export async function planFridgeLeftover({ householdId, userId, leftover, date, mealType, servings }) {
  return supabase.from('meal_plans').insert({
    household_id: householdId,
    created_by: userId,
    date: toDateStr(date),
    meal_type: mealType.trim().toLowerCase(),
    recipe_id: leftover.source_recipe_id ?? null,
    is_leftover: true,
    leftover_id: leftover.id,
    leftover_name: leftover.name,
    servings: servings ?? null,
  })
}
