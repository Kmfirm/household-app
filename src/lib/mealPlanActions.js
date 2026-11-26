import { supabase } from './supabase'
import { deductIngredientsFromPantry } from './pantryDeduction'

// Planned quantity for one ingredient: a per-meal override if set, otherwise recipe qty × scale
export function plannedQty(plan, ing) {
  const overrides = plan.ingredient_overrides ?? {}
  if (overrides[ing.id] !== undefined) return Number(overrides[ing.id])
  return Math.round(Number(ing.quantity) * (plan.scale ?? 1) * 100) / 100
}

// Subtracts a planned meal's ingredients from the pantry. `recipe` must include recipe_ingredients.
export async function deductForMeal(householdId, plan, recipe, conversions) {
  const ingredients = (recipe?.recipe_ingredients ?? []).map(ing => ({
    ...ing,
    quantity: plannedQty(plan, ing) || 0,
  }))
  return deductIngredientsFromPantry(householdId, ingredients, conversions)
}

async function fetchRecipeWithIngredients(id) {
  const { data } = await supabase
    .from('recipes')
    .select('id, name, total_servings, recipe_ingredients(*)')
    .eq('id', id)
    .single()
  return data
}

const summarizePantry = ({ deducted, skipped }) => ({ deducted: deducted.length, skipped })

// Applies AI-proposed actions in a safe order: new recipes first, then meal changes.
// Returns { applied, errors, pantry } where pantry lists what cooking deducted.
export async function applyMealPlanActions(actions, { householdId, plans, addRecipe, addMeal, updateMeal, removeMeal, conversions }) {
  const errors = []
  let applied = 0
  const refToId = {}
  const pantry = { deducted: 0, skipped: [] }

  const recordPantry = res => {
    const s = summarizePantry(res)
    pantry.deducted += s.deducted
    pantry.skipped.push(...s.skipped)
  }

  for (const a of actions.filter(a => a.type === 'create_recipe')) {
    const { data, error } = await addRecipe({
      name: a.name ?? 'New recipe',
      total_servings: a.total_servings ?? 4,
      instructions: a.instructions ?? '',
      ingredients: (a.ingredients ?? []).map(i => ({
        name: i.name,
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'count',
        category: i.category || 'other',
      })),
    })
    if (error) { errors.push(`${a.summary}: ${error.message}`); continue }
    if (a.recipe_ref) refToId[a.recipe_ref] = data.id
    applied++
  }

  for (const a of actions.filter(a => a.type !== 'create_recipe')) {
    try {
      if (a.type === 'add_meal') {
        const recipeId = a.recipe_id ?? refToId[a.recipe_ref]
        if (!recipeId || !a.date) throw new Error('missing recipe or date')
        const { data: plan, error } = await addMeal({
          date: a.date, recipe_id: recipeId, meal_type: a.meal_type ?? 'dinner', scale: a.scale ?? 1, cooked: !!a.cooked,
        })
        if (error) throw error
        if (a.cooked) recordPantry(await deductForMeal(householdId, plan, plan.recipes ?? await fetchRecipeWithIngredients(recipeId), conversions))
      } else {
        const plan = plans.find(p => p.id === a.meal_id)
        if (!plan) throw new Error('that meal is no longer on the plan')
        if (a.type === 'remove_meal') {
          const { error } = await removeMeal(plan.id)
          if (error) throw error
        } else {
          const updates = {}
          if (a.date) updates.date = a.date
          if (a.meal_type) updates.meal_type = a.meal_type
          if (a.type === 'update_meal' && a.scale != null) {
            updates.scale = a.scale
            updates.ingredient_overrides = {} // a new scale applies to every ingredient
          }
          if (a.type === 'update_meal' && a.cooked != null) updates.cooked = a.cooked
          const { error } = await updateMeal(plan.id, updates)
          if (error) throw error
          // Newly cooked: subtract from the pantry using the updated scale
          if (updates.cooked === true && !plan.cooked) {
            recordPantry(await deductForMeal(householdId, { ...plan, ...updates }, plan.recipes, conversions))
          }
        }
      }
      applied++
    } catch (err) {
      errors.push(`${a.summary}: ${err.message}`)
    }
  }

  return { applied, errors, pantry }
}
