import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function usePantry(householdId) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchItems()

    const channel = supabase
      .channel('pantry')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pantry_items',
        filter: `household_id=eq.${householdId}`,
      }, () => fetchItems())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [householdId])

  async function fetchItems() {
    const { data } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', householdId)
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  async function addItem(item) {
    const { error } = await supabase
      .from('pantry_items')
      .insert({ ...item, household_id: householdId, created_by: user.id })
    return { error }
  }

  async function updateItem(id, updates) {
    const { error } = await supabase
      .from('pantry_items')
      .update(updates)
      .eq('id', id)
    return { error }
  }

  async function deleteItem(id) {
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', id)
    return { error }
  }

  return { items, loading, addItem, updateItem, deleteItem }
}
