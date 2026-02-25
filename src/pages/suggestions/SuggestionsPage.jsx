import { useHousehold } from '../../hooks/useHousehold'
import { usePantry } from '../../hooks/usePantry'
import { useRecipes } from '../../hooks/useRecipes'
import { useSuggestions } from '../../hooks/useSuggestions'
import { useNavigate } from 'react-router-dom'

function MatchBadge({ pct, usesExpiring }) {
  const color = usesExpiring
    ? 'bg-orange-100 text-orange-700'
    : pct === 100
    ? 'bg-green-100 text-green-700'
    : 'bg-blue-50 text-blue-600'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {usesExpiring ? 'Uses expiring' : `${pct}% match`}
    </span>
  )
}

export default function SuggestionsPage() {
  const { household } = useHousehold()
  const { items: pantryItems } = usePantry(household?.id)
  const { recipes } = useRecipes(household?.id)
  const { suggestions, expiring } = useSuggestions({ pantryItems, recipes })
  const navigate = useNavigate()

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Suggestions</h1>
      <p className="text-sm text-gray-400 mb-4">Recipes you can make with what's in your pantry</p>

      {/* Expiring items alert */}
      {expiring.length > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4">
          <p className="text-sm font-semibold text-orange-700 mb-1">Use these soon</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {expiring.map(item => {
              const days = Math.ceil((new Date(item.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))
              return (
                <span key={item.id} className="text-xs bg-white border border-orange-200 text-orange-700 rounded-full px-2.5 py-1">
                  {item.name} — {days === 0 ? 'today' : `${days}d`}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Recipe suggestions */}
      {suggestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-gray-500 text-sm">
            {recipes.length === 0
              ? 'Add some recipes first, then suggestions will appear here.'
              : pantryItems.length === 0
              ? 'Add items to your pantry to get recipe suggestions.'
              : 'No recipes match 50%+ of your current pantry items.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {suggestions.map(({ recipe, matched, total, matchPct, missing, usesExpiring }) => (
            <div
              key={recipe.id}
              onClick={() => navigate(`/recipes`)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-green-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-800">{recipe.name}</h3>
                <MatchBadge pct={matchPct} usesExpiring={usesExpiring} />
              </div>

              <p className="text-xs text-gray-500 mb-2">
                {matched} of {total} ingredients in pantry
              </p>

              {/* Ingredient dots */}
              <div className="flex flex-wrap gap-1.5">
                {(recipe.recipe_ingredients ?? []).map(ing => {
                  const have = pantryItems.some(p => p.name.toLowerCase() === ing.name.toLowerCase())
                  const isExpiring = expiring.some(p => p.name.toLowerCase() === ing.name.toLowerCase())
                  return (
                    <span
                      key={ing.id ?? ing.name}
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        isExpiring
                          ? 'bg-orange-50 border-orange-200 text-orange-700'
                          : have
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}
                    >
                      {ing.name}
                    </span>
                  )
                })}
              </div>

              {missing.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Need to buy: {missing.map(m => m.name).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
