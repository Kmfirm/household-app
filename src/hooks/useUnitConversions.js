import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const WEIGHT_UNITS = ['lbs', 'lb', 'oz', 'g', 'kg']
export const VOLUME_UNITS = ['cups', 'liters', 'l', 'ml', 'gallons']
export const CONVERTIBLE_UNITS = [...WEIGHT_UNITS, ...VOLUME_UNITS]

const OZ_FACTORS = {
  oz: 1, lbs: 16, lb: 16,
  g: 0.035274, kg: 35.274,
  cups: 8, liters: 33.814, l: 33.814, ml: 0.033814, gallons: 128,
  tbsp: 0.5, tsp: 1 / 6, pints: 16, quarts: 32,
}

// Other spellings people (and receipts/AI) use, mapped to a key of OZ_FACTORS
const UNIT_ALIASES = {
  ounce: 'oz', ounces: 'oz', 'fl oz': 'oz', 'fl. oz': 'oz', floz: 'oz', 'fluid ounce': 'oz', 'fluid ounces': 'oz',
  pound: 'lb', pounds: 'lb',
  gram: 'g', grams: 'g', gr: 'g', grm: 'g',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  cup: 'cups', c: 'cups',
  liter: 'l', litre: 'l', litres: 'l',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', mls: 'ml',
  gallon: 'gallons', gal: 'gallons',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  pint: 'pints', pt: 'pints',
  quart: 'quarts', qt: 'quarts', qts: 'quarts',
}

// The OZ_FACTORS key for a unit as written ('Ounces' -> 'oz'), or null if it isn't a weight/volume
export function canonicalUnit(unit) {
  const u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (OZ_FACTORS[u] !== undefined) return u
  return UNIT_ALIASES[u] ?? null
}

// True for weight/volume units (anything toOz can convert without the count table)
export function isMeasuredUnit(unit) {
  return canonicalUnit(unit) !== null
}

// Convert quantity+unit to oz. Returns null if unit is not a known weight/volume.
// Pass conversions array to also handle count units via the lookup table.
export function toOz(quantity, unit, ingredientName, conversions) {
  const factor = OZ_FACTORS[canonicalUnit(unit)]
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
  const factor = OZ_FACTORS[canonicalUnit(unit)]
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
    const parsedCount = parseFloat(count)
    if (!parsedCount || parsedCount <= 0) return

    const isCountUnit = !isMeasuredUnit(totalUnit)
    let ozPerCount
    if (isCountUnit) {
      // count unit: the 'count' param is already oz per piece (user entered directly)
      ozPerCount = parsedCount
    } else {
      const totalOz = toOz(parseFloat(totalQuantity), totalUnit)
      if (!totalOz) return
      ozPerCount = totalOz / parsedCount
    }
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
