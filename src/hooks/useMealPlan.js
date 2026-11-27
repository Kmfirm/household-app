import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const PLAN_SELECT = '*, recipes(id, name, total_servings, recipe_ingredients(*))'

export function useMealPlan(householdId, weekStart) {
  const { user } = useAuth()
  // Everything loaded: this week's meals plus meals linked to them in other weeks
  // (the cook a leftover comes from, or leftovers planned from a cook)
  const [allPlans, setAllPlans] = useState([])
  const [loading, setLoading] = useState(true)

  const weekStartStr = weekStart ? toDateStr(weekStart) : null
  const weekEndStr = weekStart ? toDateStr(addDaysToDate(weekStart, 6)) : null

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
  }, [householdId, weekStartStr])

  async function fetchPlans() {
    const { data } = await supabase
      .from('meal_plans')
      .select(PLAN_SELECT)
      .eq('household_id', householdId)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr)
      .order('date')
      .order('meal_type')

    const week = data ?? []
    const weekIds = week.map(p => p.id)
    const sourceIds = [...new Set(week.map(p => p.leftover_of).filter(id => id && !weekIds.includes(id)))]
    const filters = []
    if (weekIds.length) filters.push(`leftover_of.in.(${weekIds.join(',')})`)
    if (sourceIds.length) filters.push(`id.in.(${sourceIds.join(',')})`)

    let linked = []
    if (filters.length) {
      const { data: more } = await supabase
        .from('meal_plans')
        .select(PLAN_SELECT)
        .eq('household_id', householdId)
        .or(filters.join(','))
      linked = (more ?? []).filter(p => !weekIds.includes(p.id))
    }

    setAllPlans([...week, ...linked])
    setLoading(false)
  }

  async function addMeal({ date, recipe_id, meal_type, scale, cooked, servings, is_leftover, leftover_of, leftover_id, leftover_name }) {
    const { data, error } = await supabase
      .from('meal_plans')
      .insert({
        household_id: householdId,
        created_by: user.id,
        date: toDateStr(date),
        recipe_id: recipe_id ?? null,
        meal_type: (meal_type ?? 'dinner').trim().toLowerCase(),
        scale: scale ?? 1,
        cooked: cooked ?? false,
        servings: servings ?? null,
        is_leftover: !!is_leftover,
        leftover_of: leftover_of ?? null,
        leftover_id: leftover_id ?? null,
        leftover_name: leftover_name ?? null,
      })
      .select(PLAN_SELECT)
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
    const before = allPlans.find(p => p.id === id)
    setAllPlans(prev => prev.map(p => p.id === id ? { ...p, ...clean } : p))
    const { error } = await supabase.from('meal_plans').update(clean).eq('id', id)
    if (error && before) setAllPlans(prev => prev.map(p => p.id === id ? before : p))
    return { error }
  }

  // Realtime doesn't deliver DELETE events on filtered subscriptions, so update local state directly.
  // Deleting a cook also deletes its planned leftovers (database cascade).
  async function removeMeal(id) {
    const { error } = await supabase.from('meal_plans').delete().eq('id', id)
    if (!error) setAllPlans(prev => prev.filter(p => p.id !== id && p.leftover_of !== id))
    return { error }
  }

  const plans = allPlans.filter(p => p.date >= weekStartStr && p.date <= weekEndStr)

  return { plans, allPlans, loading, addMeal, updateMeal, removeMeal, refresh: fetchPlans }
}

function addDaysToDate(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
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

// Shift a YYYY-MM-DD date by n days
export function addDaysStr(dateStr, n) {
  const d = fromDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

// Whole days from a to b (YYYY-MM-DD)
export function daysBetween(a, b) {
  return Math.round((fromDateStr(b) - fromDateStr(a)) / 86400000)
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
