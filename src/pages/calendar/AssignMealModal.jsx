import { useState } from 'react'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

export default function AssignMealModal({ date, recipes, onSave, onClose }) {
  const [recipeId, setRecipeId] = useState('')
  const [mealType, setMealType] = useState('dinner')
  const [servings, setServings] = useState(2)
  const [loading, setLoading] = useState(false)

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recipeId) return
    setLoading(true)
    await onSave({ recipe_id: recipeId, meal_type: mealType, servings: Number(servings) })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-800">Add meal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-5">{dateLabel}</p>

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
          </div>

          {/* Meal type */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Meal type *</label>
            <div className="flex gap-2">
              {MEAL_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition-colors ${
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

          {/* Servings */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Servings</label>
            <input
              type="number"
              min="1"
              value={servings}
              onChange={e => setServings(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
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
      </div>
    </div>
  )
}
