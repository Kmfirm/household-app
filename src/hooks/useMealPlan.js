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

  async function addMeal({ date, recipe_id, meal_type, scale, cooked }) {
    const { data, error } = await supabase
      .from('meal_plans')
      .insert({
        household_id: householdId,
        created_by: user.id,
        date: toDateStr(date),
        recipe_id,
        meal_type: (meal_type ?? 'dinner').trim().toLowerCase(),
        scale: scale ?? 1,
        cooked: cooked ?? false,
      })
      .select('*, recipes(id, name, total_servings, recipe_ingredients(*))')
      .single()
    // Don't rely on realtime to show the new meal
    if (!error) await fetchPlans()
    return { data, error }
  }

  async function updateMeal(id, updates) {
    const clean = { ...updates }
    if (clean.date !== undefined) clean.date = toDateStr(clean.date)
    if (clean.meal_type !== undefined) clean.meal_type = clean.meal_type.trim().toLowerCase()
    // Update the screen first so drag-and-drop feels instant; roll back if the save fails
    const before = plans.find(p => p.id === id)
    setPlans(prev => prev.map(p => p.id === id ? { ...p, ...clean } : p))
    const { error } = await supabase.from('meal_plans').update(clean).eq('id', id)
    if (error && before) setPlans(prev => prev.map(p => p.id === id ? before : p))
    return { error }
  }

  // Realtime doesn't deliver DELETE events on filtered subscriptions, so update local state directly
  async function removeMeal(id) {
    const { error } = await supabase.from('meal_plans').delete().eq('id', id)
    if (!error) setPlans(prev => prev.filter(p => p.id !== id))
    return { error }
  }

  return { plans, loading, addMeal, updateMeal, removeMeal }
}

// YYYY-MM-DD in local time (toISOString would use UTC and roll evenings over to tomorrow)
export function toDateStr(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const d = new Date(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Parse YYYY-MM-DD as a local date
export function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
