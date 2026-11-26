import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const DEFAULT_MEAL_TYPES = ['breakfast', 'lunch', 'dinner']

// Built-in rows the household hasn't stored an order for go first, in their usual order,
// followed by stored rows sorted by sort_order.
function orderRows(stored) {
  const storedNames = stored.map(r => r.name)
  const missingDefaults = DEFAULT_MEAL_TYPES.filter(n => !storedNames.includes(n))
  return [...missingDefaults, ...storedNames]
}

// Rows shown on the meal planner: breakfast/lunch/dinner plus any extra rows the household
// added, in the household's chosen order
export function useMealTypes(householdId) {
  const [rows, setRows] = useState(DEFAULT_MEAL_TYPES)

  useEffect(() => {
    if (!householdId) return
    supabase
      .from('household_meal_types')
      .select('name, sort_order, created_at')
      .eq('household_id', householdId)
      .order('sort_order')
      .order('created_at')
      .then(({ data }) => setRows(orderRows(data ?? [])))
  }, [householdId])

  const extraMealTypes = rows.filter(n => !DEFAULT_MEAL_TYPES.includes(n))

  async function addMealType(rawName) {
    const name = (rawName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    if (!name) return { error: { message: 'Name is required' } }
    if (rows.includes(name)) return { name }
    const { error } = await supabase
      .from('household_meal_types')
      .insert({ household_id: householdId, name, sort_order: rows.length + 1 })
    if (error) return { error }
    setRows(prev => [...prev, name])
    return { name }
  }

  async function removeMealType(name) {
    if (DEFAULT_MEAL_TYPES.includes(name)) return { error: { message: "Built-in rows can't be removed" } }
    const { error } = await supabase
      .from('household_meal_types')
      .delete()
      .eq('household_id', householdId)
      .eq('name', name)
    if (!error) setRows(prev => prev.filter(n => n !== name))
    return { error }
  }

  // Saves a new top-to-bottom order for every row (built-in rows included)
  async function reorderMealTypes(newOrder) {
    const before = rows
    setRows(newOrder)
    const { error } = await supabase
      .from('household_meal_types')
      .upsert(
        newOrder.map((name, i) => ({ household_id: householdId, name, sort_order: i + 1 })),
        { onConflict: 'household_id,name' },
      )
    if (error) setRows(before)
    return { error }
  }

  return { mealTypes: rows, extraMealTypes, addMealType, removeMealType, reorderMealTypes }
}
