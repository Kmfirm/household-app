import { useMemo } from 'react'

export function useSuggestions({ pantryItems = [], recipes = [] }) {
  const today = new Date()

  const expiring = useMemo(() =>
    pantryItems.filter(item => {
      if (!item.expiration_date) return false
      const days = Math.ceil((new Date(item.expiration_date) - today) / (1000 * 60 * 60 * 24))
      return days >= 0 && days <= 7
    }),
    [pantryItems]
  )

  const pantryNames = useMemo(() =>
    new Set(pantryItems.map(i => i.name.toLowerCase())),
    [pantryItems]
  )

  const expiringNames = useMemo(() =>
    new Set(expiring.map(i => i.name.toLowerCase())),
    [expiring]
  )

  const suggestions = useMemo(() => {
    return recipes.map(recipe => {
      const ingredients = recipe.recipe_ingredients ?? []
      if (!ingredients.length) return null

      const matched = ingredients.filter(ing =>
        pantryNames.has(ing.name.toLowerCase())
      )
      const expiringMatched = ingredients.filter(ing =>
        expiringNames.has(ing.name.toLowerCase())
      )
      const matchPct = Math.round((matched.length / ingredients.length) * 100)
      const missing = ingredients.filter(ing =>
        !pantryNames.has(ing.name.toLowerCase())
      )

      return {
        recipe,
        matched: matched.length,
        total: ingredients.length,
        matchPct,
        missing,
        usesExpiring: expiringMatched.length > 0,
        expiringCount: expiringMatched.length,
      }
    })
      .filter(Boolean)
      .filter(s => s.matchPct >= 50)
      .sort((a, b) => {
        if (b.usesExpiring !== a.usesExpiring) return (b.usesExpiring ? 1 : 0) - (a.usesExpiring ? 1 : 0)
        return b.matchPct - a.matchPct
      })
  }, [recipes, pantryNames, expiringNames])

  return { suggestions, expiring }
}
