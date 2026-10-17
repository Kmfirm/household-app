import { useState } from 'react'
import { useHousehold } from '../../hooks/useHousehold'
import { useRecipes } from '../../hooks/useRecipes'
import { usePantry } from '../../hooks/usePantry'
import { useMealPlan, getWeekStart, toDateStr } from '../../hooks/useMealPlan'
import { useShoppingList } from '../../hooks/useShoppingList'
import AssignMealModal from './AssignMealModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_COLORS = {
  breakfast: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  lunch: 'bg-blue-50 border-blue-200 text-blue-800',
  dinner: 'bg-green-50 border-green-200 text-green-800',
  snack: 'bg-purple-50 border-purple-200 text-purple-800',
}
const SCALE_OPTIONS = [0.5, 1, 2]

function scaleLabel(scale) {
  if (scale === 0.5) return '½x'
  return `${scale ?? 1}x`
}

function getPantryMatch(ing, pantryItems) {
  return pantryItems.find(p =>
    p.name.toLowerCase().includes(ing.name.toLowerCase()) ||
    ing.name.toLowerCase().includes(p.name.toLowerCase())
  )
}

export default function CalendarPage() {
  const { household } = useHousehold()
  const { recipes } = useRecipes(household?.id)
  const { items: pantryItems } = usePantry(household?.id)
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const { plans, loading, addMeal, updateMeal, removeMeal } = useMealPlan(household?.id, weekStart)
  const { addItem: addToShoppingList } = useShoppingList(household?.id)
  const [assignDay, setAssignDay] = useState(null)
  const [expandedMeals, setExpandedMeals] = useState(new Set())
  const [localQtyEdits, setLocalQtyEdits] = useState({})
  const [addingToList, setAddingToList] = useState(new Set())

  function toggleExpanded(planId) {
    setExpandedMeals(prev => {
      const s = new Set(prev)
      if (s.has(planId)) s.delete(planId)
      else s.add(planId)
      return s
    })
  }

  async function changeScale(plan, newScale) {
    // Clear overrides so scale applies uniformly to all ingredients
    await updateMeal(plan.id, { scale: newScale, ingredient_overrides: {} })
    // Also clear any pending local edits for this plan
    setLocalQtyEdits(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (k.startsWith(`${plan.id}_`)) delete next[k] })
      return next
    })
  }

  function getIngredientQty(plan, ing) {
    const key = `${plan.id}_${ing.id}`
    if (localQtyEdits[key] !== undefined) return localQtyEdits[key]
    const overrides = plan.ingredient_overrides ?? {}
    if (overrides[ing.id] !== undefined) return overrides[ing.id]
    return Math.round(ing.quantity * (plan.scale ?? 1) * 100) / 100
  }

  function handleQtyChange(plan, ing, value) {
    setLocalQtyEdits(prev => ({ ...prev, [`${plan.id}_${ing.id}`]: value }))
  }

  async function handleQtyBlur(plan, ing) {
    const key = `${plan.id}_${ing.id}`
    const raw = localQtyEdits[key]
    if (raw === undefined) return
    const parsed = parseFloat(raw)
    if (isNaN(parsed)) {
      // Revert local edit
      setLocalQtyEdits(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    const overrides = { ...(plan.ingredient_overrides ?? {}), [ing.id]: parsed }
    await updateMeal(plan.id, { ingredient_overrides: overrides })
    setLocalQtyEdits(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  async function addIngredientToList(ing, qty) {
    const key = ing.name.toLowerCase()
    setAddingToList(prev => new Set([...prev, key]))
    await addToShoppingList({
      name: ing.name,
      quantity: qty,
      unit: ing.unit,
      category: ing.category ?? 'other',
      checked: false,
    })
    setAddingToList(prev => { const s = new Set(prev); s.delete(key); return s })
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const today = toDateStr(new Date())

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  function plansForDay(date) {
    const ds = toDateStr(date)
    return plans
      .filter(p => p.date === ds)
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type))
  }

  function weekLabel() {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(weekStart)} – ${fmt(end)}`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Meal Plan</h1>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={prevWeek} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600">‹</button>
          <span className="text-gray-600 text-xs">{weekLabel()}</span>
          <button onClick={nextWeek} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {days.map(day => {
            const ds = toDateStr(day)
            const isToday = ds === today
            const dayPlans = plansForDay(day)

            return (
              <div
                key={ds}
                className={`bg-white rounded-xl border shadow-sm p-3 ${isToday ? 'border-green-300' : 'border-gray-100'}`}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isToday ? 'text-green-600' : 'text-gray-700'}`}>
                      {DAY_NAMES[day.getDay()]}
                    </span>
                    <span className={`text-xs ${isToday ? 'text-green-500' : 'text-gray-400'}`}>
                      {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Today</span>
                    )}
                  </div>
                  <button
                    onClick={() => setAssignDay(day)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    + Add
                  </button>
                </div>

                {/* Meals */}
                {dayPlans.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">No meals planned</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {dayPlans.map(plan => {
                      const scale = plan.scale ?? 1
                      const totalServings = plan.recipes?.total_servings
                        ? Math.round(plan.recipes.total_servings * scale * 10) / 10
                        : null
                      const isExpanded = expandedMeals.has(plan.id)
                      const ingredients = plan.recipes?.recipe_ingredients ?? []

                      return (
                        <div
                          key={plan.id}
                          className={`rounded-lg border px-3 py-2 transition-opacity ${MEAL_COLORS[plan.meal_type]} ${plan.cooked ? 'opacity-50' : ''}`}
                        >
                          {/* Meal header — click to collapse/expand */}
                          <div className="flex items-start justify-between gap-2">
                            <button
                              className="flex-1 min-w-0 text-left"
                              onClick={() => toggleExpanded(plan.id)}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium capitalize">{plan.meal_type}</span>
                                <span className={`text-xs font-semibold truncate ${plan.cooked ? 'line-through opacity-60' : ''}`}>
                                  {plan.recipes?.name}
                                </span>
                                <span className="text-xs opacity-30">{isExpanded ? '▲' : '▼'}</span>
                              </div>
                              <span className="text-xs opacity-60">
                                {scaleLabel(scale)}{totalServings !== null ? ` · ${totalServings} serving${totalServings !== 1 ? 's' : ''}` : ''}
                              </span>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => updateMeal(plan.id, { cooked: !plan.cooked })}
                                className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                                  plan.cooked
                                    ? 'bg-green-600 text-white border-green-600'
                                    : 'bg-white/60 border-current/30 opacity-70 hover:opacity-100'
                                }`}
                              >
                                {plan.cooked ? '✓ Cooked' : 'Mark cooked'}
                              </button>
                              <button
                                onClick={() => removeMeal(plan.id)}
                                className="text-xs opacity-40 hover:opacity-80 ml-1"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Expanded: scale selector + ingredient list */}
                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-current/10">
                              {/* Scale selector */}
                              <div className="flex items-center gap-2 mb-2.5">
                                <span className="text-xs opacity-60 font-medium">Scale:</span>
                                <div className="flex gap-1">
                                  {SCALE_OPTIONS.map(s => (
                                    <button
                                      key={s}
                                      onClick={() => changeScale(plan, s)}
                                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                                        scale === s
                                          ? 'bg-current/20 border-current/50'
                                          : 'bg-white/60 border-current/20 opacity-50 hover:opacity-90'
                                      }`}
                                    >
                                      {scaleLabel(s)}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Ingredient rows */}
                              {ingredients.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {ingredients.map(ing => {
                                    const pantryMatch = getPantryMatch(ing, pantryItems)
                                    const qty = getIngredientQty(plan, ing)

                                    return (
                                      <div key={ing.id} className="flex items-center gap-2 text-xs">
                                        {/* Name */}
                                        <span className="flex-1 truncate">{ing.name}</span>

                                        {/* Editable quantity */}
                                        <input
                                          type="number"
                                          value={qty}
                                          min="0"
                                          step="0.25"
                                          onChange={e => handleQtyChange(plan, ing, e.target.value)}
                                          onBlur={() => handleQtyBlur(plan, ing)}
                                          className="w-14 text-right bg-white/70 border border-current/20 rounded px-1 py-0.5 focus:outline-none focus:border-current/60"
                                        />

                                        {/* Unit */}
                                        <span className="opacity-50 w-10 truncate">{ing.unit}</span>

                                        {/* Pantry status */}
                                        {pantryMatch ? (
                                          <span className="opacity-60 whitespace-nowrap">
                                            pantry: {pantryMatch.quantity} {pantryMatch.unit}
                                          </span>
                                        ) : plan.cooked ? (
                                          <span className="opacity-35 whitespace-nowrap italic">had it</span>
                                        ) : (
                                          <button
                                            onClick={() => addIngredientToList(ing, qty)}
                                            disabled={addingToList.has(ing.name.toLowerCase())}
                                            className="bg-white/70 border border-current/20 rounded px-1.5 py-0.5 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap disabled:opacity-40"
                                          >
                                            + List
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs opacity-40 italic">No ingredients</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {assignDay && (
        <AssignMealModal
          date={assignDay}
          recipes={recipes}
          onSave={async (data) => {
            await addMeal({ ...data, date: assignDay })
            setAssignDay(null)
          }}
          onClose={() => setAssignDay(null)}
        />
      )}
    </div>
  )
}
