import { useState } from 'react'
import CookRecipeModal from '../../components/common/CookRecipeModal'
import { useLeftovers } from '../../hooks/useLeftovers'
import { useHousehold } from '../../hooks/useHousehold'

export default function RecipeDetail({ recipe, onEdit, onDelete, onBack, onRate }) {
  const { household } = useHousehold()
  const { cookRecipe } = useLeftovers(household?.id)
  const [showCookModal, setShowCookModal] = useState(false)
  const [cookedToast, setCookedToast] = useState(null)

  async function handleCook(data) {
    const { remaining } = await cookRecipe(data)
    setCookedToast(
      remaining > 0
        ? `Cooked! ${remaining} serving${remaining !== 1 ? 's' : ''} saved as leftovers.`
        : 'Cooked! Pantry updated.'
    )
    setTimeout(() => setCookedToast(null), 3500)
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
        ← Back to recipes
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-800">{recipe.name}</h1>
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={() => setShowCookModal(true)}
              className="text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg font-medium"
            >
              🍳 Cook this
            </button>
            <button onClick={onEdit}
              className="text-xs text-blue-500 hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-lg">
              Edit
            </button>
            <button onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 border border-red-200 rounded-lg">
              Delete
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {recipe.total_servings} serving{recipe.total_servings !== 1 ? 's' : ''}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-gray-500">Rating:</span>
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} onClick={() => onRate(star === recipe.rating ? null : star)}
              className={`text-xl leading-none ${star <= (recipe.rating ?? 0) ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}>
              ★
            </button>
          ))}
        </div>

        {/* Ingredients */}
        {recipe.recipe_ingredients?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Ingredients</h2>
            <ul className="flex flex-col gap-1">
              {recipe.recipe_ingredients.map(ing => (
                <li key={ing.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="font-medium">{ing.quantity} {ing.unit}</span>
                  <span>{ing.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipe.instructions && (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Instructions</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{recipe.instructions}</p>
          </div>
        )}

        {recipe.notes && (
          <div className="mt-4 bg-yellow-50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-yellow-700 mb-1">Notes</h2>
            <p className="text-sm text-yellow-800 whitespace-pre-wrap">{recipe.notes}</p>
          </div>
        )}
      </div>

      {showCookModal && (
        <CookRecipeModal
          recipe={recipe}
          onCook={handleCook}
          onClose={() => setShowCookModal(false)}
        />
      )}

      {cookedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 whitespace-nowrap">
          {cookedToast}
        </div>
      )}
    </div>
  )
}
