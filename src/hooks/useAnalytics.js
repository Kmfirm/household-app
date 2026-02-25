import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAnalytics(householdId) {
  const [spending, setSpending] = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const [storeBreakdown, setStoreBreakdown] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchAll()
  }, [householdId])

  async function fetchAll() {
    const [receiptsRes, priceRes, pantryRes] = await Promise.all([
      supabase
        .from('receipts')
        .select('store_name, purchase_date, total_spent')
        .eq('household_id', householdId)
        .order('purchase_date', { ascending: false })
        .limit(50),
      supabase
        .from('price_history')
        .select('*')
        .eq('household_id', householdId)
        .order('purchase_date', { ascending: false })
        .limit(100),
      supabase
        .from('pantry_items')
        .select('name, purchase_price, store_of_purchase, date_added')
        .eq('household_id', householdId)
        .not('purchase_price', 'is', null),
    ])

    // Build weekly spending from receipts + pantry items with prices
    const receiptData = receiptsRes.data ?? []
    const pantryWithPrice = pantryRes.data ?? []

    // Combine spending sources
    const allSpending = [
      ...receiptData.map(r => ({
        date: r.purchase_date,
        amount: r.total_spent ?? 0,
        store: r.store_name ?? 'Unknown',
      })),
      ...pantryWithPrice
        .filter(p => !receiptData.length) // Only use if no receipts
        .map(p => ({
          date: p.date_added?.split('T')[0],
          amount: p.purchase_price ?? 0,
          store: p.store_of_purchase ?? 'Unknown',
        })),
    ]

    // Group by week
    const byWeek = {}
    allSpending.forEach(s => {
      if (!s.date || !s.amount) return
      const d = new Date(s.date)
      d.setDate(d.getDate() - d.getDay())
      const week = d.toISOString().split('T')[0]
      byWeek[week] = (byWeek[week] ?? 0) + Number(s.amount)
    })
    setSpending(
      Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([week, total]) => ({ week, total: Math.round(total * 100) / 100 }))
    )

    // Store breakdown
    const byStore = {}
    allSpending.forEach(s => {
      if (!s.store || !s.amount) return
      byStore[s.store] = (byStore[s.store] ?? 0) + Number(s.amount)
    })
    setStoreBreakdown(
      Object.entries(byStore)
        .sort(([, a], [, b]) => b - a)
        .map(([store, total]) => ({ store, total: Math.round(total * 100) / 100 }))
    )

    setPriceHistory(priceRes.data ?? [])
    setLoading(false)
  }

  async function recordPrice({ item_name, store, price, price_per_unit, unit }) {
    await supabase.from('price_history').insert({
      household_id: householdId,
      item_name,
      store,
      price,
      price_per_unit,
      unit,
    })
  }

  // Price comparison for a specific item across stores
  function priceComparison(itemName) {
    const matches = priceHistory.filter(p =>
      p.item_name.toLowerCase().includes(itemName.toLowerCase())
    )
    const byStore = {}
    matches.forEach(p => {
      const store = p.store ?? 'Unknown'
      if (!byStore[store] || p.purchase_date > byStore[store].date) {
        byStore[store] = { price: p.price, unit: p.unit, date: p.purchase_date }
      }
    })
    return Object.entries(byStore).map(([store, data]) => ({ store, ...data }))
  }

  const totalSpent = spending.reduce((s, w) => s + w.total, 0)
  const avgWeekly = spending.length ? Math.round(totalSpent / spending.length * 100) / 100 : 0

  return { spending, priceHistory, storeBreakdown, loading, totalSpent, avgWeekly, priceComparison, recordPrice }
}
