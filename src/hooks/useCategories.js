import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const DEFAULT_CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']

export function normalizeCategory(name) {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Built-in categories plus any the household has added
export function useCategories(householdId) {
  const [custom, setCustom] = useState([])

  useEffect(() => {
    if (!householdId) return
    supabase
      .from('household_categories')
      .select('name')
      .eq('household_id', householdId)
      .order('name')
      .then(({ data }) => setCustom((data ?? []).map(r => r.name)))
  }, [householdId])

  const categories = [...DEFAULT_CATEGORIES, ...custom.filter(c => !DEFAULT_CATEGORIES.includes(c))]

  async function addCategory(rawName) {
    const name = normalizeCategory(rawName)
    if (!name) return { error: { message: 'Category name is required' } }
    if (categories.includes(name)) return { name }
    const { error } = await supabase
      .from('household_categories')
      .upsert({ household_id: householdId, name }, { onConflict: 'household_id,name', ignoreDuplicates: true })
    if (error) return { error }
    setCustom(prev => [...prev, name].sort())
    return { name }
  }

  return { categories, addCategory }
}
