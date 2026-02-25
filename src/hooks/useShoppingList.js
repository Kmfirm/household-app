import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getWeekStart, toDateStr } from './useMealPlan'

export function useShoppingList(householdId) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchItems()

    const channel = supabase
      .channel('shopping_items')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shopping_items',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchItems())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [householdId])

  async function fetchItems() {
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('household_id', householdId)
      .order('checked')
      .order('category')
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  async function addItem(item) {
    const { error } = await supabase
      .from('shopping_items')
      .insert({ ...item, household_id: householdId, created_by: user.id })
    return { error }
  }

  async function toggleChecked(id, checked) {
    const { error } = await supabase
      .from('shopping_items')
      .update({ checked })
      .eq('id', id)
    return { error }
  }

  async function deleteItem(id) {
    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    return { error }
  }

  async function clearChecked() {
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('household_id', householdId)
      .eq('checked', true)
    return { error }
  }

  // Auto-generate from this week's meal plan gaps vs pantry
  async function generateFromMealPlan(pantryItems) {
    const weekStart = getWeekStart()
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const { data: plans } = await supabase
      .from('meal_plans')
      .select('recipe_id, servings, recipes(id, name, recipe_ingredients(*))')
      .eq('household_id', householdId)
      .gte('date', toDateStr(weekStart))
      .lte('date', toDateStr(weekEnd))

    if (!plans?.length) return { count: 0 }

    // Aggregate required ingredients across all planned meals
    const required = {}
    for (const plan of plans) {
      const ingredients = plan.recipes?.recipe_ingredients ?? []
      for (const ing of ingredients) {
        const key = ing.name.toLowerCase()
        if (!required[key]) {
          required[key] = { name: ing.name, quantity: 0, unit: ing.unit, category: ing.category ?? 'other', recipe_id: plan.recipe_id }
        }
        required[key].quantity += ing.quantity * (plan.servings / (plan.recipes?.total_servings || 1))
      }
    }

    // Filter out items already sufficiently in pantry
    const missing = Object.values(required).filter(req => {
      const pantryMatch = pantryItems.find(p =>
        p.name.toLowerCase().includes(req.name.toLowerCase()) ||
        req.name.toLowerCase().includes(p.name.toLowerCase())
      )
      return !pantryMatch || pantryMatch.quantity <= 0
    })

    if (!missing.length) return { count: 0 }

    // Remove existing auto-generated items before re-inserting
    await supabase
      .from('shopping_items')
      .delete()
      .eq('household_id', householdId)
      .eq('auto_generated', true)

    const { error } = await supabase
      .from('shopping_items')
      .insert(missing.map(m => ({
        household_id: householdId,
        created_by: user.id,
        name: m.name,
        quantity: Math.ceil(m.quantity * 10) / 10,
        unit: m.unit,
        category: m.category,
        auto_generated: true,
        recipe_id: m.recipe_id,
        checked: false,
      })))

    return { count: missing.length, error }
  }

  // Move all checked items to pantry
  async function addCheckedToPantry() {
    const checked = items.filter(i => i.checked)
    if (!checked.length) return { count: 0 }

    const { error } = await supabase
      .from('pantry_items')
      .insert(checked.map(item => ({
        household_id: householdId,
        created_by: user.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        storage_location: 'pantry',
        store_of_purchase: item.store ?? null,
      })))

    if (!error) {
      await supabase
        .from('shopping_items')
        .delete()
        .eq('household_id', householdId)
        .eq('checked', true)
    }

    return { count: checked.length, error }
  }

  return {
    items,
    loading,
    addItem,
    toggleChecked,
    deleteItem,
    clearChecked,
    generateFromMealPlan,
    addCheckedToPantry,
  }
}
