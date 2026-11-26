import { useState, useMemo, useRef } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core'
import { useHousehold } from '../../hooks/useHousehold'
import { useRecipes } from '../../hooks/useRecipes'
import { usePantry } from '../../hooks/usePantry'
import { useMealPlan, getWeekStart, toDateStr } from '../../hooks/useMealPlan'
import { useMealTypes } from '../../hooks/useMealTypes'
import { useShoppingList } from '../../hooks/useShoppingList'
import { useUnitConversions } from '../../hooks/useUnitConversions'
import { applyMealPlanActions, deductForMeal } from '../../lib/mealPlanActions'
import AssignMealModal from './AssignMealModal'
import MealDetailModal from './MealDetailModal'
import AiChat from './AiChat'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ROW_COLORS = {
  breakfast: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  lunch: 'bg-blue-50 border-blue-200 text-blue-900',
  dinner: 'bg-green-50 border-green-200 text-green-900',
}
const EXTRA_COLOR = 'bg-purple-50 border-purple-200 text-purple-900'
const cellId = (date, mealType) => `${date}|${mealType}`

function MealCard({ plan, onOpen, dragging = false }) {
  const scale = plan.scale ?? 1
  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border px-2 py-1.5 text-xs cursor-pointer select-none ${ROW_COLORS[plan.meal_type] ?? EXTRA_COLOR} ${
        plan.cooked ? 'opacity-60' : ''
      } ${dragging ? 'shadow-lg ring-2 ring-green-400 rotate-1' : 'hover:shadow-sm'}`}
    >
      <p className={`font-semibold leading-snug line-clamp-2 ${plan.cooked ? 'line-through' : ''}`}>
        {plan.recipes?.name ?? 'Leftovers'}
      </p>
      {(scale !== 1 || plan.cooked) && (
        <p className="opacity-70 mt-0.5">
          {scale !== 1 ? (scale === 0.5 ? '½x' : `${scale}x`) : ''}
          {scale !== 1 && plan.cooked ? ' · ' : ''}
          {plan.cooked ? '✓ cooked' : ''}
        </p>
      )}
    </div>
  )
}

function DraggableMeal({ plan, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: plan.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`touch-manipulation ${isDragging ? 'opacity-30' : ''}`}>
      <MealCard plan={plan} onOpen={onOpen} />
    </div>
  )
}

function DroppableCell({ id, isToday, children, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`group min-h-[4.5rem] p-1 flex flex-col gap-1 border-l border-t border-gray-100 transition-colors ${
        isOver ? 'bg-green-100' : isToday ? 'bg-green-50/40' : 'bg-white'
      }`}
    >
      {children}
      <button
        onClick={onAdd}
        className="mt-auto text-[11px] text-gray-300 hover:text-green-600 group-hover:text-gray-400 text-left px-1"
        aria-label="Add meal"
      >
        + add
      </button>
    </div>
  )
}

export default function CalendarPage() {
  const { household } = useHousehold()
  const { recipes, addRecipe } = useRecipes(household?.id)
  const { items: pantryItems } = usePantry(household?.id)
  const { conversions } = useUnitConversions(household?.id)
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const { plans, loading, addMeal, updateMeal, removeMeal } = useMealPlan(household?.id, weekStart)
  const { mealTypes, extraMealTypes, addMealType, removeMealType } = useMealTypes(household?.id)
  const { addItem: addToShoppingList } = useShoppingList(household?.id)

  const [assignSlot, setAssignSlot] = useState(null) // { date: Date, mealType }
  const [openPlanId, setOpenPlanId] = useState(null)
  const [cookingIds, setCookingIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [activeDragId, setActiveDragId] = useState(null)
  const [showAssistant, setShowAssistant] = useState(false)
  const [addingRow, setAddingRow] = useState(false)
  const [newRowName, setNewRowName] = useState('')
  const justDragged = useRef(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch screens so normal scrolling still works
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  // Ingredient names used across recipes, most common first (for the recipe form's suggestions)
  const allIngredients = useMemo(() => {
    const freq = {}
    for (const recipe of recipes) {
      for (const ing of recipe.recipe_ingredients ?? []) {
        const key = ing.name.toLowerCase()
        if (!freq[key]) freq[key] = { name: ing.name, unit: ing.unit, count: 0 }
        freq[key].count++
      }
    }
    return Object.values(freq).sort((a, b) => b.count - a.count)
  }, [recipes])

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const dayStrs = days.map(toDateStr)
  const today = toDateStr(new Date())

  // Rows: breakfast/lunch/dinner, the household's extra rows, plus any other meal type used this week
  const rows = useMemo(() => {
    const used = plans.map(p => p.meal_type).filter(t => t && !mealTypes.includes(t))
    return [...mealTypes, ...new Set(used)]
  }, [mealTypes, plans])

  const plansBySlot = useMemo(() => {
    const map = {}
    for (const p of plans) (map[cellId(p.date, p.meal_type)] ??= []).push(p)
    return map
  }, [plans])

  const openPlan = plans.find(p => p.id === openPlanId) ?? null
  const activePlan = plans.find(p => p.id === activeDragId) ?? null

  function showToast(msg, ms = 5000) {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  function shiftWeek(days) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + days)
    setWeekStart(d)
  }

  function weekLabel() {
    const end = days[6]
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(days[0])} – ${fmt(end)}`
  }

  function handleDragEnd({ active, over }) {
    setActiveDragId(null)
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 150)
    if (!over) return
    const plan = plans.find(p => p.id === active.id)
    const [date, mealType] = String(over.id).split('|')
    if (!plan || (plan.date === date && plan.meal_type === mealType)) return
    updateMeal(plan.id, { date, meal_type: mealType }).then(({ error }) => {
      if (error) showToast(`Couldn't move meal: ${error.message}`)
    })
  }

  function openMeal(id) {
    if (!justDragged.current) setOpenPlanId(id)
  }

  async function toggleCooked(plan) {
    if (plan.cooked) {
      await updateMeal(plan.id, { cooked: false })
      return
    }
    if (cookingIds.has(plan.id)) return
    setCookingIds(prev => new Set([...prev, plan.id]))
    try {
      const { deducted, skipped } = await deductForMeal(household.id, plan, plan.recipes, conversions)
      await updateMeal(plan.id, { cooked: true })
      const parts = [`Cooked ${plan.recipes?.name ?? 'meal'}.`]
      if (deducted.length) parts.push(`Updated ${deducted.length} pantry item${deducted.length !== 1 ? 's' : ''}.`)
      if (skipped.length) parts.push(`Not deducted: ${skipped.join(', ')}.`)
      showToast(parts.join(' '), 6000)
    } catch (err) {
      showToast(`Couldn't update pantry: ${err.message}`)
    } finally {
      setCookingIds(prev => { const s = new Set(prev); s.delete(plan.id); return s })
    }
  }

  async function handleRemove(id) {
    const { error } = await removeMeal(id)
    if (error) showToast(`Couldn't remove meal: ${error.message}`)
    else setOpenPlanId(null)
  }

  async function addIngredientToList(ing, qty) {
    await addToShoppingList({
      name: ing.name,
      quantity: qty,
      unit: ing.unit,
      category: ing.category ?? 'other',
      checked: false,
    })
  }

  async function handleAddRow(e) {
    e.preventDefault()
    const { error } = await addMealType(newRowName)
    if (error) { showToast(error.message); return }
    setNewRowName('')
    setAddingRow(false)
  }

  // What the AI sees about the planner
  function aiContext() {
    return {
      today,
      week: dayStrs.map((date, i) => ({ date, weekday: DAY_NAMES[i] })),
      meal_rows: rows,
      meals: plans.map(p => ({
        id: p.id,
        date: p.date,
        meal_type: p.meal_type,
        recipe_id: p.recipe_id,
        recipe: p.recipes?.name ?? 'Leftovers',
        scale: p.scale ?? 1,
        cooked: !!p.cooked,
      })),
      recipes: recipes.map(r => ({ id: r.id, name: r.name, total_servings: r.total_servings })),
    }
  }

  function aiApply(actions) {
    return applyMealPlanActions(actions, {
      householdId: household.id, plans, addRecipe, addMeal, updateMeal, removeMeal, conversions,
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h1 className="text-xl font-bold text-gray-800">Meal Plan</h1>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => shiftWeek(-7)} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600" aria-label="Previous week">‹</button>
          <span className="text-gray-600 text-xs">{weekLabel()}</span>
          <button onClick={() => shiftWeek(7)} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600" aria-label="Next week">›</button>
          <button onClick={() => setWeekStart(getWeekStart())} className="ml-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
            Today
          </button>
          <button
            onClick={() => setShowAssistant(true)}
            className="ml-1 text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700"
          >
            ✨ AI
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveDragId(active.id)}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={handleDragEnd}
        >
          {/* The grid scrolls sideways on narrow screens; the meal labels stay pinned */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <div
              className="grid min-w-[52rem]"
              style={{ gridTemplateColumns: '5.5rem repeat(7, minmax(0, 1fr))' }}
            >
              {/* Day headers */}
              <div className="sticky left-0 z-10 bg-gray-50" />
              {days.map((d, i) => {
                const isToday = dayStrs[i] === today
                return (
                  <div key={dayStrs[i]} className={`px-2 py-2 border-l border-gray-100 text-center ${isToday ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <p className={`text-xs font-semibold ${isToday ? 'text-green-700' : 'text-gray-700'}`}>{DAY_NAMES[i]}</p>
                    <p className={`text-[11px] ${isToday ? 'text-green-600' : 'text-gray-400'}`}>
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                )
              })}

              {/* Meal rows */}
              {rows.map(row => {
                const rowHasMeals = dayStrs.some(ds => plansBySlot[cellId(ds, row)]?.length)
                const removable = extraMealTypes.includes(row) && !rowHasMeals
                return (
                  <div key={row} className="contents">
                    <div className="sticky left-0 z-10 bg-white border-t border-gray-100 px-2 py-2 flex items-start justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600 capitalize break-words">{row}</span>
                      {removable && (
                        <button
                          onClick={() => removeMealType(row)}
                          className="text-[11px] text-gray-300 hover:text-red-500"
                          aria-label={`Remove ${row} row`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {days.map((d, i) => {
                      const id = cellId(dayStrs[i], row)
                      return (
                        <DroppableCell
                          key={id}
                          id={id}
                          isToday={dayStrs[i] === today}
                          onAdd={() => setAssignSlot({ date: d, mealType: row })}
                        >
                          {(plansBySlot[id] ?? []).map(plan => (
                            <DraggableMeal key={plan.id} plan={plan} onOpen={() => openMeal(plan.id)} />
                          ))}
                        </DroppableCell>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activePlan ? <div className="w-32"><MealCard plan={activePlan} dragging /></div> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add a meal row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {addingRow ? (
          <form onSubmit={handleAddRow} className="flex gap-2">
            <input
              autoFocus
              value={newRowName}
              onChange={e => setNewRowName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setAddingRow(false) }}
              placeholder="e.g. Snack, Dessert"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button type="submit" disabled={!newRowName.trim()} className="text-sm bg-green-600 text-white px-3 rounded-lg disabled:opacity-40">Add</button>
            <button type="button" onClick={() => setAddingRow(false)} className="text-sm text-gray-500 px-2">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setAddingRow(true)} className="text-xs text-green-600 hover:text-green-700 font-medium">
            + Add meal row
          </button>
        )}
        <p className="text-[11px] text-gray-400 ml-auto">Drag meals to move them · long-press on touch screens</p>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm bg-gray-800 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50">
          {toast}
        </div>
      )}

      {openPlan && (
        <MealDetailModal
          plan={openPlan}
          pantryItems={pantryItems}
          cooking={cookingIds.has(openPlan.id)}
          onUpdate={updateMeal}
          onToggleCooked={toggleCooked}
          onRemove={handleRemove}
          onAddToList={addIngredientToList}
          onClose={() => setOpenPlanId(null)}
        />
      )}

      {assignSlot && (
        <AssignMealModal
          date={assignSlot.date}
          initialMealType={assignSlot.mealType}
          mealTypes={rows}
          recipes={recipes}
          onCreateRecipe={addRecipe}
          pantryItems={pantryItems}
          allIngredients={allIngredients}
          getAiContext={aiContext}
          onAiApply={aiApply}
          onSave={async (data) => {
            const { error } = await addMeal({ ...data, date: assignSlot.date })
            if (error) { showToast(`Couldn't add meal: ${error.message}`); return }
            setAssignSlot(null)
          }}
          onClose={() => setAssignSlot(null)}
        />
      )}

      {showAssistant && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4" onClick={() => setShowAssistant(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">✨ Meal plan assistant</h2>
                <p className="text-xs text-gray-500">Week of {weekLabel()} · changes are applied only after you confirm</p>
              </div>
              <button onClick={() => setShowAssistant(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <AiChat
              mode="plan"
              getContext={aiContext}
              onApply={aiApply}
              placeholder="e.g. Move Tuesday's dinner to Thursday and add oatmeal for breakfast Mon–Fri"
              intro="Ask me to add, move, rescale, remove or mark meals cooked this week. I'll propose the changes and you choose which to apply."
              examples={[
                'Swap Monday and Wednesday dinners',
                'Double every dinner on the weekend',
                'I made the chili last night, mark it cooked',
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
