import { useState } from 'react'

export default function CookRecipeModal({ recipe, onCook, onClose }) {
  const [totalCooked, setTotalCooked] = useState(recipe.total_servings)
  const [consumed, setConsumed] = useState(recipe.total_servings)
  const [loading, setLoading] = useState(false)

  const remaining = Math.max(0, totalCooked - consumed)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await onCook({
      recipe,
      totalCooked: Number(totalCooked),
      consumedServings: Number(consumed),
    })
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-800">Mark as cooked</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-5">{recipe.name}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Total servings cooked
            </label>
            <input
              type="number"
              min="1"
              value={totalCooked}
              onChange={e => {
                setTotalCooked(e.target.value)
                if (Number(e.target.value) < consumed) setConsumed(e.target.value)
              }}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Servings eaten now
            </label>
            <input
              type="number"
              min="0"
              max={totalCooked}
              value={consumed}
              onChange={e => setConsumed(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {remaining > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              <span className="font-medium">{remaining} serving{remaining !== 1 ? 's' : ''}</span> will be saved as leftovers (expires in 4 days)
            </div>
          )}

          {remaining === 0 && Number(totalCooked) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
              All servings eaten — no leftovers
            </div>
          )}

          <p className="text-xs text-gray-400">
            Pantry ingredients will be automatically deducted.
          </p>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
