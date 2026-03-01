import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const WEIGHT_UNITS = ['lbs', 'lb', 'oz', 'g', 'kg']
export const VOLUME_UNITS = ['cups', 'liters', 'l', 'ml', 'gallons']
export const CONVERTIBLE_UNITS = [...WEIGHT_UNITS, ...VOLUME_UNITS]

const OZ_FACTORS = {
  oz: 1, lbs: 16, lb: 16,
  g: 0.035274, kg: 35.274,
  cups: 8, liters: 33.814, l: 33.814, ml: 0.033814, gallons: 128,
}

// Convert quantity+unit to oz. Returns null if unit is not a known weight/volume.
// Pass conversions array to also handle count units via the lookup table.
export function toOz(quantity, unit, ingredientName, conversions) {
  const factor = OZ_FACTORS[unit?.toLowerCase()]
  if (factor !== undefined) return quantity * factor

  // Count unit — look up conversion table
  if (conversions?.length && ingredientName) {
    const conv = conversions.find(
      c => c.ingredient_name.toLowerCase() === ingredientName.toLowerCase()
    )
    if (conv) return quantity * conv.oz_per_count
  }

  return null
}

// Convert oz back to a given unit. Returns null if unknown unit.
export function fromOz(oz, unit) {
  const factor = OZ_FACTORS[unit?.toLowerCase()]
  return factor ? oz / factor : null
}

export function useUnitConversions(householdId) {
  const [conversions, setConversions] = useState([])

  useEffect(() => {
    if (householdId) fetchConversions()
  }, [householdId])

  async function fetchConversions() {
    const { data } = await supabase
      .from('unit_conversions')
      .select('*')
      .eq('household_id', householdId)
    setConversions(data ?? [])
  }

  function getConversion(ingredientName) {
    return conversions.find(
      c => c.ingredient_name.toLowerCase() === ingredientName?.toLowerCase()
    ) ?? null
  }

  // totalQuantity + totalUnit = what was entered (e.g. 5.5, 'lbs')
  // count = how many pieces the user said that is (e.g. 8)
  // countLabel = what to call one piece (e.g. 'thigh')
  async function upsertConversion(ingredientName, totalQuantity, totalUnit, count, countLabel) {
    const totalOz = toOz(parseFloat(totalQuantity), totalUnit)
    if (!totalOz || !count || parseFloat(count) <= 0) return

    const ozPerCount = totalOz / parseFloat(count)
    const existing = getConversion(ingredientName)

    if (existing) {
      const averaged = (existing.oz_per_count * existing.sample_count + ozPerCount) / (existing.sample_count + 1)
      await supabase
        .from('unit_conversions')
        .update({
          oz_per_count: averaged,
          count_label: countLabel,
          sample_count: existing.sample_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('unit_conversions').insert({
        household_id: householdId,
        ingredient_name: ingredientName.toLowerCase(),
        oz_per_count: ozPerCount,
        count_label: countLabel,
        sample_count: 1,
      })
    }

    await fetchConversions()
  }

  return { conversions, fetchConversions, getConversion, upsertConversion }
}
