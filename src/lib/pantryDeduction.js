import { supabase } from './supabase'
import { toOz } from '../hooks/useUnitConversions'

const COUNT_UNITS = new Set(['', 'each', 'ea', 'ct', 'count', 'pc', 'pcs', 'piece', 'pieces', 'whole', 'item', 'items', 'unit', 'units'])

function normUnit(unit) {
  const u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  return COUNT_UNITS.has(u) ? 'each' : u
}

function normName(name) {
  return (name ?? '').trim().toLowerCase()
}

// Pantry items that correspond to a recipe ingredient: exact name matches if any,
// otherwise items whose name contains (or is contained by) the ingredient name.
export function findPantryMatches(ingName, pantryItems) {
  const n = normName(ingName)
  if (!n) return []
  const exact = pantryItems.filter(p => normName(p.name) === n)
  if (exact.length) return exact
  return pantryItems.filter(p => {
    const pn = normName(p.name)
    return pn && (pn.includes(n) || n.includes(pn))
  })
}

// oz for an amount, trying the item's own name and then the ingredient name for count conversions
function amountToOz(qty, unit, names, conversions) {
  for (const name of names) {
    const oz = toOz(qty, unit, name, conversions)
    if (oz !== null) return oz
  }
  return null
}

// oz per 1 of `unit` for this item (handles count units via the conversion table)
function ozPerUnit(unit, names, conversions) {
  return amountToOz(1, unit, names, conversions)
}

function purchaseTime(item) {
  return new Date(item.receipts?.purchase_date ?? item.date_added ?? 0).getTime()
}

// Deducts the given ingredient amounts from the household pantry.
// ingredients: [{ name, quantity, unit }] â€” quantities already scaled to what was cooked.
// Returns { deducted: [{ name, from, to, unit }], skipped: [ingredient names] }
export async function deductIngredientsFromPantry(householdId, ingredients, conversions = []) {
  const { data: pantry, error } = await supabase
    .from('pantry_items')
    .select('id, name, quantity, unit, date_added, receipts(purchase_date)')
    .eq('household_id', householdId)
  if (error) throw error

  // Work on a local copy so multiple ingredients hitting the same item stack correctly
  const items = (pantry ?? []).map(p => ({ ...p, quantity: Number(p.quantity) || 0 }))
  const original = new Map(items.map(p => [p.id, p.quantity]))
  const skipped = []

  for (const ing of ingredients) {
    const needQty = Number(ing.quantity)
    if (!needQty || needQty <= 0) continue

    // Use oldest stock first
    const matches = findPantryMatches(ing.name, items)
      .filter(p => p.quantity > 0)
      .sort((a, b) => purchaseTime(a) - purchaseTime(b))
    if (!matches.length) { skipped.push(ing.name); continue }

    const needOz = amountToOz(needQty, ing.unit, [ing.name], conversions)
    let remainingOz = needOz
    let remainingQty = needQty // used for same-unit fallback
    let touched = false

    for (const item of matches) {
      if ((remainingOz ?? remainingQty) <= 0) break
      const names = [item.name, ing.name]
      const perUnit = ozPerUnit(item.unit, names, conversions)

      if (remainingOz !== null && perUnit) {
        const itemOz = item.quantity * perUnit
        const usedOz = Math.min(itemOz, remainingOz)
        item.quantity = Math.max(0, Math.round(((itemOz - usedOz) / perUnit) * 1000) / 1000)
        remainingOz -= usedOz
        touched = true
      } else if (normUnit(item.unit) === normUnit(ing.unit)) {
        const used = Math.min(item.quantity, remainingQty)
        item.quantity = Math.max(0, Math.round((item.quantity - used) * 1000) / 1000)
        remainingQty -= used
        if (remainingOz !== null && needQty) remainingOz = needOz * (remainingQty / needQty)
        touched = true
      }
    }

    if (!touched) skipped.push(ing.name)
  }

  const changed = items.filter(p => p.quantity !== original.get(p.id))
  await Promise.all(changed.map(p =>
    supabase.from('pantry_items').update({ quantity: p.quantity }).eq('id', p.id)
  ))

  return {
    deducted: changed.map(p => ({ name: p.name, from: original.get(p.id), to: p.quantity, unit: p.unit })),
    skipped,
  }
}
