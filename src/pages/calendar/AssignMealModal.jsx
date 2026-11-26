import { useState } from 'react'
import RecipeForm from '../recipes/RecipeForm'
import AiChat from './AiChat'
import { toDateStr } from '../../hooks/useMealPlan'

const SCALES = [0.5, 1, 2]

export default function AssignMealModal({
  date, initialMealType = 'dinner', mealTypes, recipes, onSave, onClose,
  onCreateRecipe, pantryItems = [], allIngredients = [], getAiContext, onAiApply,
}) {
  const [tab, setTab] = useState('pick') // pick | ai
  const [recipeId, setRecipeId] = useState('')
  const [mealType, setMealType] = useState(initialMealType)
  const [scale, setScale] = useState(1)
  const [loading, setLoading] = useState(false)
  const [creatingRecipe, setCreatingRecipe] = useState(false)
  const [createError, setCreateError] = useState(null)

  async function handleCreateRecipe(data) {
    const { data: created, error } = await onCreateRecipe(data)
    if (error) {
      setCreateError(error.message ?? 'Could not save recipe')
      return
    }
    setCreateError(null)
    setRecipeId(created.id)
    setCreatingRecipe(false)
  }

  if (creatingRecipe) {
    return (
      <>
        <RecipeForm
          onSave={handleCreateRecipe}
          onClose={() => { setCreatingRecipe(false); setCreateError(null) }}
          pantryItems={pantryItems}
          allIngredients={allIngredients}
        />
        {createError && (
          <div className="fixed top-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm bg-red-600 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-[60]">
            {createError}
          </div>
        )}
      </>
    )
  }

  const typeOptions = mealTypes.includes(mealType) ? mealTypes : [...mealTypes, mealType]
  const selectedRecipe = recipes.find(r => r.id === recipeId)
  const scaledServings = selectedRecipe
    ? Math.round(selectedRecipe.total_servings * scale * 10) / 10
    : null

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recipeId) return
    setLoading(true)
    await onSave({ recipe_id: recipeId, meal_type: mealType, scale })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl w-full p-6 flex flex-col max-h-[90vh] ${tab === 'ai' ? 'max-w-lg h-[80vh]' : 'max-w-sm'}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-800">Add meal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-3">{dateLabel}</p>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => setTab('pick')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md ${tab === 'pick' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            Pick a recipe
          </button>
          <button
            onClick={() => setTab('ai')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md ${tab === 'ai' ? 'bg-white shadow-sm text-purple-700' : 'text-gray-500'}`}
          >
            ✨ Describe with AI
          </button>
        </div>

        {/* Meal type (shared by both modes) */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Meal</label>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setMealType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${
                  mealType === type
                    ? 'bg-green-600 text-white border-green-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {tab === 'ai' ? (
          <AiChat
            mode="slot"
            getContext={() => ({ ...getAiContext(), slot: { date: toDateStr(date), meal_type: mealType } })}
            onApply={onAiApply}
            placeholder="e.g. Chicken stir fry with peppers and rice for 4"
            intro="Tell me what you're making (or already made). I'll match one of your recipes or create a new one, then add it here. If you say you already made it, I'll mark it cooked and update your pantry."
            examples={[
              'Making turkey chili for 6 tonight',
              'I had scrambled eggs and toast',
            ]}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Recipe picker */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Recipe *</label>
              <select
                required
                value={recipeId}
                onChange={e => setRecipeId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Select a recipe...</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {onCreateRecipe && (
                <button
                  type="button"
                  onClick={() => setCreatingRecipe(true)}
                  className="mt-1.5 text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  + Create new recipe
                </button>
              )}
            </div>

            {/* Scale */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Scale</label>
              <div className="flex gap-2">
                {SCALES.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      scale === s
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s === 0.5 ? '½x' : `${s}x`}
                  </button>
                ))}
              </div>
              {scaledServings !== null && (
                <p className="text-xs text-gray-400 mt-1.5">
                  = {scaledServings} serving{scaledServings !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !recipeId}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add to plan'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
