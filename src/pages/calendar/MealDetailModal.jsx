import { useState } from 'react'
import { plannedQty } from '../../lib/mealPlanActions'
import { fromDateStr } from '../../hooks/useMealPlan'

const SCALE_OPTIONS = [0.5, 1, 2]
const scaleLabel = s => (s === 0.5 ? '½x' : `${s ?? 1}x`)

function getPantryMatch(ing, pantryItems) {
  return pantryItems.find(p =>
    p.name.toLowerCase().includes(ing.name.toLowerCase()) ||
    ing.name.toLowerCase().includes(p.name.toLowerCase())
  )
}

// Details for one planned meal: scale, editable ingredient amounts, pantry status, cooked, remove
export default function MealDetailModal({ plan, pantryItems, cooking, onUpdate, onToggleCooked, onRemove, onAddToList, onClose }) {
  const [qtyEdits, setQtyEdits] = useState({})
  const [adding, setAdding] = useState(new Set())

  const scale = plan.scale ?? 1
  const ingredients = plan.recipes?.recipe_ingredients ?? []
  const totalServings = plan.recipes?.total_servings
    ? Math.round(plan.recipes.total_servings * scale * 10) / 10
    : null
  const dateLabel = fromDateStr(plan.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  async function changeScale(s) {
    setQtyEdits({})
    await onUpdate(plan.id, { scale: s, ingredient_overrides: {} })
  }

  async function saveQty(ing) {
    const raw = qtyEdits[ing.id]
    if (raw === undefined) return
    const parsed = parseFloat(raw)
    setQtyEdits(prev => { const n = { ...prev }; delete n[ing.id]; return n })
    if (isNaN(parsed)) return
    await onUpdate(plan.id, { ingredient_overrides: { ...(plan.ingredient_overrides ?? {}), [ing.id]: parsed } })
  }

  async function addToList(ing, qty) {
    setAdding(prev => new Set([...prev, ing.id]))
    await onAddToList(ing, qty)
    setAdding(prev => { const s = new Set(prev); s.delete(ing.id); return s })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h2 className={`text-lg font-bold text-gray-800 ${plan.cooked ? 'line-through opacity-60' : ''}`}>
              {plan.recipes?.name ?? 'Meal'}
            </h2>
            <p className="text-sm text-gray-500 capitalize">
              {plan.meal_type} · {dateLabel}
              {totalServings !== null ? ` · ${totalServings} serving${totalServings !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Scale */}
        <div className="flex items-center gap-2 my-3">
          <span className="text-xs text-gray-500 font-medium">Scale:</span>
          {SCALE_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => changeScale(s)}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                scale === s ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {scaleLabel(s)}
            </button>
          ))}
        </div>

        {/* Ingredients */}
        {ingredients.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
            {ingredients.map(ing => {
              const match = getPantryMatch(ing, pantryItems)
              const qty = qtyEdits[ing.id] ?? plannedQty(plan, ing)
              return (
                <div key={ing.id} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="flex-1 truncate">{ing.name}</span>
                  <input
                    type="number"
                    value={qty}
                    min="0"
                    step="0.25"
                    onChange={e => setQtyEdits(prev => ({ ...prev, [ing.id]: e.target.value }))}
                    onBlur={() => saveQty(ing)}
                    className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-green-400"
                  />
                  <span className="text-gray-400 w-10 truncate">{ing.unit}</span>
                  {match ? (
                    <span className="text-gray-400 whitespace-nowrap w-24 truncate text-right">
                      pantry: {Math.round(Number(match.quantity) * 100) / 100} {match.unit}
                    </span>
                  ) : plan.cooked ? (
                    <span className="text-gray-300 italic w-24 text-right">had it</span>
                  ) : (
                    <button
                      onClick={() => addToList(ing, qty)}
                      disabled={adding.has(ing.id)}
                      className="w-24 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
                    >
                      + Shopping list
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-3">No ingredients</p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={() => onRemove(plan.id)}
            className="border border-red-200 text-red-500 rounded-lg px-3 py-2 text-sm hover:bg-red-50"
          >
            Remove
          </button>
          <button
            onClick={() => onToggleCooked(plan)}
            disabled={cooking}
            className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
              plan.cooked
                ? 'border border-green-600 text-green-700 hover:bg-green-50'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {cooking ? 'Saving…' : plan.cooked ? '✓ Cooked — undo' : 'Mark cooked'}
          </button>
        </div>
      </div>
    </div>
  )
}
