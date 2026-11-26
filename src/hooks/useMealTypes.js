import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const DEFAULT_MEAL_TYPES = ['breakfast', 'lunch', 'dinner']

// Rows shown on the meal planner: breakfast/lunch/dinner plus any extra rows the household added
export function useMealTypes(householdId) {
  const [extra, setExtra] = useState([])

  useEffect(() => {
    if (!householdId) return
    supabase
      .from('household_meal_types')
      .select('name, sort_order')
      .eq('household_id', householdId)
      .order('sort_order')
      .order('created_at')
      .then(({ data }) => setExtra((data ?? []).map(r => r.name)))
  }, [householdId])

  async function addMealType(rawName) {
    const name = (rawName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    if (!name) return { error: { message: 'Name is required' } }
    if (DEFAULT_MEAL_TYPES.includes(name) || extra.includes(name)) return { name }
    const { error } = await supabase
      .from('household_meal_types')
      .insert({ household_id: householdId, name, sort_order: extra.length + 1 })
    if (error) return { error }
    setExtra(prev => [...prev, name])
    return { name }
  }

  async function removeMealType(name) {
    const { error } = await supabase
      .from('household_meal_types')
      .delete()
      .eq('household_id', householdId)
      .eq('name', name)
    if (!error) setExtra(prev => prev.filter(n => n !== name))
    return { error }
  }

  return { mealTypes: [...DEFAULT_MEAL_TYPES, ...extra], extraMealTypes: extra, addMealType, removeMealType }
}
