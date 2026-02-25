import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useRecipes(householdId) {
  const { user } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchRecipes()

    const channel = supabase
      .channel('recipes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'recipes',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchRecipes())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [householdId])

  async function fetchRecipes() {
    const { data } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*)')
      .eq('household_id', householdId)
      .order('name')
    setRecipes(data ?? [])
    setLoading(false)
  }

  async function addRecipe({ ingredients, ...recipe }) {
    const { data, error } = await supabase
      .from('recipes')
      .insert({ ...recipe, household_id: householdId, created_by: user.id })
      .select()
      .single()
    if (error) return { error }

    if (ingredients?.length) {
      const { error: ingErr } = await supabase
        .from('recipe_ingredients')
        .insert(ingredients.map(i => ({ ...i, recipe_id: data.id })))
      if (ingErr) return { error: ingErr }
    }

    await fetchRecipes()
    return { data }
  }

  async function updateRecipe(id, { ingredients, ...recipe }) {
    const { error } = await supabase
      .from('recipes')
      .update(recipe)
      .eq('id', id)
    if (error) return { error }

    // Replace all ingredients
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
    if (ingredients?.length) {
      await supabase
        .from('recipe_ingredients')
        .insert(ingredients.map(i => ({ ...i, recipe_id: id })))
    }

    await fetchRecipes()
    return {}
  }

  async function deleteRecipe(id) {
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    return { error }
  }

  async function rateRecipe(id, rating) {
    return updateRecipe(id, { rating })
  }

  return { recipes, loading, addRecipe, updateRecipe, deleteRecipe, rateRecipe }
}
