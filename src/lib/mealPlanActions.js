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

// Applies AI-proposed actions in a safe order: new recipes, then new meals, then leftovers
// planned from them, then changes to existing meals.
// ctx.setCooked(plan, cooked) marks a meal cooked/eaten and returns { deducted, skipped }.
// Returns { applied, errors, pantry } where pantry summarises what cooking deducted.
export async function applyMealPlanActions(actions, ctx) {
  const { plans, addRecipe, addMeal, updateMeal, removeMeal, setCooked } = ctx
  const errors = []
  let applied = 0
  const refToRecipeId = {}
  const refToMeal = {}
  const pantry = { deducted: 0, skipped: [] }

  async function cook(plan, cooked) {
    const res = await setCooked(plan, cooked)
    pantry.deducted += res.deducted?.length ?? 0
    pantry.skipped.push(...(res.skipped ?? []))
  }

  const order = { create_recipe: 0, add_meal: 1, add_leftover: 2 }
  const sorted = [...actions].sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3))

  for (const a of sorted) {
    try {
      if (a.type === 'create_recipe') {
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
        if (error) throw error
        if (a.recipe_ref) refToRecipeId[a.recipe_ref] = data.id
      } else if (a.type === 'add_meal') {
        const recipeId = a.recipe_id ?? refToRecipeId[a.recipe_ref]
        if (!recipeId || !a.date) throw new Error('missing recipe or date')
        const { data: plan, error } = await addMeal({
          date: a.date, recipe_id: recipeId, meal_type: a.meal_type ?? 'dinner',
          scale: a.scale ?? 1, servings: a.servings ?? null,
        })
        if (error) throw error
        if (a.meal_ref) refToMeal[a.meal_ref] = plan
        if (a.cooked) await cook(plan, true)
      } else if (a.type === 'add_leftover') {
        if (!a.date) throw new Error('missing date')
        const source = refToMeal[a.source_meal_ref] ?? ctx.allPlans.find(p => p.id === a.source_meal_id)
        const fridge = a.leftover_id ? ctx.leftovers.find(l => l.id === a.leftover_id) : null
        if (!source && !fridge) throw new Error('missing the meal or fridge leftover it comes from')
        const { data: plan, error } = await addMeal({
          date: a.date,
          meal_type: a.meal_type ?? 'lunch',
          servings: a.servings ?? null,
          is_leftover: true,
          ...(source
            ? { leftover_of: source.id, recipe_id: source.recipe_id }
            : { leftover_id: fridge.id, recipe_id: fridge.source_recipe_id, leftover_name: fridge.name }),
        })
        if (error) throw error
        if (a.cooked) await cook(plan, true)
      } else {
        const plan = plans.find(p => p.id === a.meal_id) ?? ctx.allPlans.find(p => p.id === a.meal_id)
        if (!plan) throw new Error('that meal is no longer on the plan')
        if (a.type === 'remove_meal') {
          const { error } = await removeMeal(plan.id)
          if (error) throw error
        } else {
          const updates = {}
          if (a.date) updates.date = a.date
          if (a.meal_type) updates.meal_type = a.meal_type
          if (a.type === 'update_meal' && a.scale != null && !plan.is_leftover) {
            updates.scale = a.scale
            updates.ingredient_overrides = {} // a new scale applies to every ingredient
          }
          if (a.type === 'update_meal' && a.servings != null) updates.servings = a.servings
          if (Object.keys(updates).length) {
            const { error } = await updateMeal(plan.id, updates)
            if (error) throw error
          }
          // Cooked/eaten changes go through the shared logic (pantry + leftovers)
          if (a.type === 'update_meal' && a.cooked != null && a.cooked !== !!plan.cooked) {
            await cook({ ...plan, ...updates }, a.cooked)
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
