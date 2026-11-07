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
      .select('*, receipts(purchase_date)')
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

  // Realtime doesn't deliver DELETE events on filtered subscriptions, so update local state directly
  async function deleteItem(id) {
    return deleteItems([id])
  }

  async function deleteItems(ids) {
    const { data, error } = await supabase
      .from('pantry_items')
      .delete()
      .in('id', ids)
      .select('id')
    const deletedIds = new Set((data ?? []).map(row => row.id))
    if (deletedIds.size) setItems(prev => prev.filter(item => !deletedIds.has(item.id)))
    return { error, deletedCount: deletedIds.size }
  }

  return { items, loading, addItem, updateItem, deleteItem, deleteItems }
}
