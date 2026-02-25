import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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
  async function cookRecipe({ recipe, totalCooked, consumedServings }) {
    const remaining = totalCooked - consumedServings
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

    // Deduct ingredients from pantry
    for (const ing of recipe.recipe_ingredients ?? []) {
      const { data: pantryItems } = await supabase
        .from('pantry_items')
        .select('id, quantity, unit')
        .eq('household_id', householdId)
        .ilike('name', `%${ing.name}%`)
        .limit(1)

      if (pantryItems?.length) {
        const item = pantryItems[0]
        const newQty = Math.max(0, item.quantity - ing.quantity)
        await supabase
          .from('pantry_items')
          .update({ quantity: newQty })
          .eq('id', item.id)
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
