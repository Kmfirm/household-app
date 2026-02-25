import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useMealPlan(householdId, weekStart) {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId || !weekStart) return
    fetchPlans()

    const channel = supabase
      .channel('meal_plans')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'meal_plans',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchPlans())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [householdId, weekStart])

  async function fetchPlans() {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const { data } = await supabase
      .from('meal_plans')
      .select('*, recipes(id, name, total_servings, recipe_ingredients(*))')
      .eq('household_id', householdId)
      .gte('date', toDateStr(weekStart))
      .lte('date', toDateStr(weekEnd))
      .order('date')
      .order('meal_type')

    setPlans(data ?? [])
    setLoading(false)
  }

  async function addMeal({ date, recipe_id, meal_type, servings }) {
    const { error } = await supabase
      .from('meal_plans')
      .insert({
        household_id: householdId,
        created_by: user.id,
        date: toDateStr(date),
        recipe_id,
        meal_type,
        servings,
      })
    return { error }
  }

  async function removeMeal(id) {
    const { error } = await supabase.from('meal_plans').delete().eq('id', id)
    return { error }
  }

  return { plans, loading, addMeal, removeMeal }
}

export function toDateStr(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
