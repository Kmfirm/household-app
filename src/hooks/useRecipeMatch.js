import { toOz, fromOz } from './useUnitConversions'

// Returns match status for each recipe ingredient against the pantry.
// status: 'have_enough' | 'partial' | 'missing' | 'unknown'
export function matchRecipeIngredients(ingredients, pantryItems, conversions, scaleFactor = 1) {
  return (ingredients ?? []).map(ing => {
    const required = ing.quantity * scaleFactor
    const matching = (pantryItems ?? []).filter(
      p => p.name.toLowerCase() === ing.name.toLowerCase()
    )

    if (matching.length === 0) {
      return { ingredient: ing, status: 'missing', availableOz: 0, requiredOz: null }
    }

    const requiredOz = toOz(required, ing.unit, ing.name, conversions)
    const availableOz = matching.reduce((sum, p) => {
      const oz = toOz(p.quantity, p.unit, p.name, conversions)
      return sum + (oz ?? 0)
    }, 0)

    if (requiredOz !== null) {
      if (availableOz >= requiredOz) return { ingredient: ing, status: 'have_enough', availableOz, requiredOz }
      if (availableOz > 0)          return { ingredient: ing, status: 'partial',      availableOz, requiredOz }
      return                               { ingredient: ing, status: 'missing',      availableOz, requiredOz }
    }

    // Can't convert to oz — fall back to same-unit comparison
    const sameUnit = matching.filter(p => p.unit.toLowerCase() === ing.unit.toLowerCase())
    if (sameUnit.length > 0) {
      const available = sameUnit.reduce((sum, p) => sum + p.quantity, 0)
      if (available >= required) return { ingredient: ing, status: 'have_enough', availableOz: null, requiredOz: null }
      if (available > 0)         return { ingredient: ing, status: 'partial',      availableOz: null, requiredOz: null }
    }

    return { ingredient: ing, status: 'unknown', availableOz: null, requiredOz: null }
  })
}

// How much of a pantry item to deduct when cooking an ingredient
// Returns { id, newQuantity } or null if can't determine
export function calcDeduction(pantryItem, ingQuantity, ingUnit, ingName, conversions) {
  const requiredOz = toOz(ingQuantity, ingUnit, ingName, conversions)
  const pantryOz   = toOz(pantryItem.quantity, pantryItem.unit, pantryItem.name, conversions)

  if (requiredOz !== null && pantryOz !== null) {
    const remainingOz  = Math.max(0, pantryOz - requiredOz)
    const remainingQty = fromOz(remainingOz, pantryItem.unit)
    if (remainingQty !== null) {
      return { id: pantryItem.id, newQuantity: Math.round(remainingQty * 1000) / 1000 }
    }
  }

  // Same unit fallback
  if (pantryItem.unit.toLowerCase() === ingUnit.toLowerCase()) {
    return { id: pantryItem.id, newQuantity: Math.max(0, pantryItem.quantity - ingQuantity) }
  }

  return null
}
