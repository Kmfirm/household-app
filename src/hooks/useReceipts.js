import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useReceipts(householdId) {
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (householdId) fetchReceipts()
  }, [householdId])

  async function fetchReceipts() {
    if (!householdId) return
    setLoading(true)
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('household_id', householdId)
      .order('purchase_date', { ascending: false })
    setReceipts(data ?? [])
    setLoading(false)
  }

  async function fetchReceiptItems(receiptId) {
    const { data } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('receipt_reference_id', receiptId)
      .order('name')
    return data ?? []
  }

  async function updateReceipt(id, updates) {
    const { error } = await supabase
      .from('receipts')
      .update(updates)
      .eq('id', id)
    return { error }
  }

  async function updateReceiptItem(id, updates) {
    const { error } = await supabase
      .from('pantry_items')
      .update(updates)
      .eq('id', id)
    return { error }
  }

  async function deleteReceiptItem(id) {
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', id)
    return { error }
  }

  async function deleteReceipt(id) {
    // Delete linked pantry items first
    await supabase
      .from('pantry_items')
      .delete()
      .eq('receipt_reference_id', id)

    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', id)
    return { error }
  }

  async function getImageUrl(imagePath) {
    if (!imagePath) return null
    const { data } = await supabase.storage
      .from('receipt-images')
      .createSignedUrl(imagePath, 60 * 60) // 1 hour
    return data?.signedUrl ?? null
  }

  return {
    receipts,
    loading,
    fetchReceipts,
    fetchReceiptItems,
    updateReceipt,
    updateReceiptItem,
    deleteReceiptItem,
    deleteReceipt,
    getImageUrl,
  }
}
