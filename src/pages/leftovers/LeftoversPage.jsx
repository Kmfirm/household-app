import { useHousehold } from '../../hooks/useHousehold'
import { useLeftovers } from '../../hooks/useLeftovers'

function expirationStatus(expDate) {
  if (!expDate) return null
  const days = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (days < 0) return { label: 'Expired', color: 'text-red-600 bg-red-50 border-red-200' }
  if (days <= 1) return { label: `${days}d left`, color: 'text-red-500 bg-red-50 border-red-200' }
  if (days <= 3) return { label: `${days}d left`, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
  return { label: `${days}d left`, color: 'text-gray-500 bg-gray-50 border-gray-200' }
}

export default function LeftoversPage() {
  const { household } = useHousehold()
  const { leftovers, loading, updateServings, deleteLeftover } = useLeftovers(household?.id)

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Leftovers</h1>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : leftovers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🍱</p>
          <p className="text-sm">No leftovers right now</p>
          <p className="text-xs mt-1">Cook a recipe to generate leftovers</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leftovers.map(leftover => {
            const exp = expirationStatus(leftover.expiration_date)
            return (
              <div key={leftover.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{leftover.name}</p>
                    {leftover.recipes?.name && (
                      <p className="text-xs text-gray-400 mt-0.5">from {leftover.recipes.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {exp && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${exp.color}`}>
                          {exp.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteLeftover(leftover.id)}
                    className="text-gray-300 hover:text-red-400 text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Servings counter */}
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-gray-500">Servings remaining:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateServings(leftover.id, leftover.remaining_servings - 1)}
                      className="w-7 h-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-bold flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold text-gray-800 w-8 text-center">
                      {leftover.remaining_servings}
                    </span>
                    <button
                      onClick={() => updateServings(leftover.id, leftover.remaining_servings + 1)}
                      className="w-7 h-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-bold flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
