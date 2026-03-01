import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { calcDeduction } from './useRecipeMatch'

export function useLeftovers(householdId) {
  const { user } = useAuth()
  const [leftovers, setLeftovers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchLeftovers()

    const channel = supabase
      .channel('leftovers')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'leftovers',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchLeftovers())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [householdId])

  async function fetchLeftovers() {
    const { data } = await supabase
      .from('leftovers')
      .select('*, recipes:source_recipe_id(name)')
      .eq('household_id', householdId)
      .gt('remaining_servings', 0)
      .order('expiration_date', { nullsFirst: false })
    setLeftovers(data ?? [])
    setLoading(false)
  }

  // Called when a recipe is marked as cooked
  async function cookRecipe({ recipe, totalCooked, consumedServings, conversions }) {
    const remaining = totalCooked - consumedServings
    const scaleFactor = totalCooked / (recipe.total_servings || 1)

    if (remaining > 0) {
      const expDate = new Date()
      expDate.setDate(expDate.getDate() + 4) // default 4 days for leftovers
      await supabase.from('leftovers').insert({
        household_id: householdId,
        created_by: user.id,
        source_recipe_id: recipe.id,
        name: recipe.name,
        remaining_servings: remaining,
        expiration_date: expDate.toISOString().split('T')[0],
      })
    }

    // Deduct ingredients from pantry (scaled by how many servings were cooked)
    for (const ing of recipe.recipe_ingredients ?? []) {
      const scaledQty = ing.quantity * scaleFactor
      const { data: pantryItems } = await supabase
        .from('pantry_items')
        .select('id, name, quantity, unit')
        .eq('household_id', householdId)
        .ilike('name', ing.name)
        .limit(1)

      if (pantryItems?.length) {
        const item = pantryItems[0]
        const deduction = calcDeduction(item, scaledQty, ing.unit, ing.name, conversions ?? [])
        if (deduction) {
          await supabase
            .from('pantry_items')
            .update({ quantity: deduction.newQuantity })
            .eq('id', item.id)
        }
      }
    }

    return { remaining }
  }

  async function updateServings(id, remaining_servings) {
    if (remaining_servings <= 0) {
      return supabase.from('leftovers').delete().eq('id', id)
    }
    return supabase.from('leftovers').update({ remaining_servings }).eq('id', id)
  }

  async function deleteLeftover(id) {
    return supabase.from('leftovers').delete().eq('id', id)
  }

  return { leftovers, loading, cookRecipe, updateServings, deleteLeftover }
}
