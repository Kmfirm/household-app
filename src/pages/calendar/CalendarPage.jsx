import { useState, useMemo, useRef, useEffect } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useHousehold } from '../../hooks/useHousehold'
import { useRecipes } from '../../hooks/useRecipes'
import { usePantry } from '../../hooks/usePantry'
import { useMealPlan, getWeekStart, toDateStr, fromDateStr } from '../../hooks/useMealPlan'
import { useMealTypes, DEFAULT_MEAL_TYPES } from '../../hooks/useMealTypes'
import { useShoppingList } from '../../hooks/useShoppingList'
import { useUnitConversions } from '../../hooks/useUnitConversions'
import { useLeftovers } from '../../hooks/useLeftovers'
import { useHouseholdSettings } from '../../hooks/useHouseholdSettings'
import { useAuth } from '../../context/AuthContext'
import { applyMealPlanActions } from '../../lib/mealPlanActions'
import { setMealCooked, mealName, isLeftoverSlot } from '../../lib/leftovers'
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
const VIEW_KEY = 'mealPlanView'
const INVERT_KEY = 'mealPlanInverted'
const cellId = (date, mealType) => `${date}|${mealType}`

function loadPref(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}
const loadView = () => (loadPref(VIEW_KEY) === 'day' ? 'day' : 'week')
const saveView = view => savePref(VIEW_KEY, view)

function addDays(dateStr, n) {
  const d = fromDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function MealCard({ plan, onOpen, dragging = false, large = false }) {
  const scale = plan.scale ?? 1
  return (
    <div
      onClick={onOpen}
      className={`rounded-lg border cursor-pointer select-none ${large ? 'px-3 py-2.5 text-sm' : 'px-2 py-1.5 text-xs'} ${
        ROW_COLORS[plan.meal_type] ?? EXTRA_COLOR
      } ${plan.cooked ? 'opacity-60' : ''} ${dragging ? 'shadow-lg ring-2 ring-green-400 rotate-1' : 'hover:shadow-sm'}`}
    >
      <p className={`font-semibold leading-snug ${large ? '' : 'line-clamp-2'} ${plan.cooked ? 'line-through' : ''}`}>
        {isLeftoverSlot(plan) ? '♻ ' : ''}{mealName(plan)}
      </p>
      {(scale !== 1 || plan.cooked || (large && plan.recipes?.total_servings)) && (
        <p className="opacity-70 mt-0.5 text-xs">
          {[
            scale !== 1 ? (scale === 0.5 ? '½x' : `${scale}x`) : null,
            large && plan.recipes?.total_servings
              ? `${Math.round(plan.recipes.total_servings * scale * 10) / 10} servings`
              : null,
            plan.cooked ? (isLeftoverSlot(plan) ? '✓ eaten' : '✓ cooked') : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function DraggableMeal({ plan, onOpen, large }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: plan.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`touch-manipulation ${isDragging ? 'opacity-30' : ''}`}>
      <MealCard plan={plan} onOpen={onOpen} large={large} />
    </div>
  )
}

function DroppableCell({ id, isToday, children, onAdd, className = '' }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`group flex flex-col gap-1 transition-colors ${className} ${
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

function SortableRow({ row, builtIn }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white ${isDragging ? 'border-green-400 shadow-md relative z-10' : 'border-gray-200'}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 px-1 text-base leading-none"
        aria-label={`Drag to reorder ${row}`}
      >
        ⠿
      </button>
      <span className="flex-1 text-sm capitalize text-gray-700">
        {row}
        {builtIn && <span className="text-[11px] text-gray-400 normal-case"> · built-in</span>}
      </span>
    </div>
  )
}

function ViewOptions({ view, onViewChange, inverted, onInvertChange, rows, builtInRows, onReorder, onClose }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    onReorder(arrayMove(rows, rows.indexOf(active.id), rows.indexOf(over.id)))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">View options</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <p className="text-xs font-medium text-gray-600 mb-1.5">Layout</p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-1">
          {[['week', 'Week'], ['day', 'Day']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md ${view === key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={`flex items-center justify-between gap-3 mt-3 text-sm ${view === 'week' ? 'text-gray-700' : 'text-gray-400'}`}>
          <span>
            Invert week grid
            <span className="block text-[11px] text-gray-400">Days down the side, meals across the top</span>
          </span>
          <input
            type="checkbox"
            checked={inverted}
            disabled={view !== 'week'}
            onChange={e => onInvertChange(e.target.checked)}
            className="accent-green-600 w-4 h-4"
          />
        </label>
        <p className="text-[11px] text-gray-400 mt-2 mb-5">Layout settings are saved on this device.</p>

        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-gray-600">Meal order · drag to rearrange</p>
          <button
            onClick={() => onReorder([...rows].reverse())}
            className="text-xs text-green-600 hover:text-green-800 font-medium"
          >
            ⇅ Reverse
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1">
              {rows.map(row => <SortableRow key={row} row={row} builtIn={builtInRows.includes(row)} />)}
            </div>
          </SortableContext>
        </DndContext>
        <p className="text-[11px] text-gray-400 mt-1.5">Meal order is shared with everyone in your household.</p>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { household } = useHousehold()
  const { recipes, addRecipe } = useRecipes(household?.id)
  const { items: pantryItems, refetch: refreshPantry } = usePantry(household?.id)
  const { conversions } = useUnitConversions(household?.id)
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const { plans, allPlans, loading, addMeal, updateMeal, removeMeal } = useMealPlan(household?.id, weekStart)
  const { user } = useAuth()
  const { leftovers, refresh: refreshLeftovers } = useLeftovers(household?.id)
  const { settings } = useHouseholdSettings(household?.id)
  const { mealTypes, extraMealTypes, addMealType, removeMealType, reorderMealTypes } = useMealTypes(household?.id)
  const { addItem: addToShoppingList } = useShoppingList(household?.id)

  const today = toDateStr(new Date())
  const [view, setView] = useState(loadView)
  const [inverted, setInverted] = useState(() => loadPref(INVERT_KEY) === '1')
  const [selectedDay, setSelectedDay] = useState(today)
  const [showViewOptions, setShowViewOptions] = useState(false)
  const [assignSlot, setAssignSlot] = useState(null) // { date: Date, mealType }
  const [openPlanId, setOpenPlanId] = useState(null)
  const [cookingIds, setCookingIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [activeDragId, setActiveDragId] = useState(null)
  const [showAssistant, setShowAssistant] = useState(false)
  const [addingRow, setAddingRow] = useState(false)
  const [newRowName, setNewRowName] = useState('')
  const justDragged = useRef(false)
  const toastSeq = useRef(0)
  const touchStartX = useRef(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch screens so normal scrolling still works
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  // Keep the loaded week in step with the selected day in day view
  useEffect(() => {
    if (view !== 'day') return
    const ws = getWeekStart(fromDateStr(selectedDay))
    if (toDateStr(ws) !== toDateStr(weekStart)) setWeekStart(ws)
  }, [view, selectedDay])

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

  // Rows: the household's ordered rows, plus any other meal type used this week
  const rows = useMemo(() => {
    const used = plans.map(p => p.meal_type).filter(t => t && !mealTypes.includes(t))
    return [...mealTypes, ...new Set(used)]
  }, [mealTypes, plans])

  const plansBySlot = useMemo(() => {
    const map = {}
    for (const p of plans) (map[cellId(p.date, p.meal_type)] ??= []).push(p)
    return map
  }, [plans])

  const openPlan = allPlans.find(p => p.id === openPlanId) ?? null
  const activePlan = plans.find(p => p.id === activeDragId) ?? null

  // action: optional { label, run } shown as a button on the toast
  function showToast(msg, ms = 5000, action = null) {
    const id = ++toastSeq.current
    setToast({ id, msg, action })
    // Only clear this toast, not a newer one shown since
    setTimeout(() => setToast(t => (t?.id === id ? null : t)), ms)
  }

  function changeView(next) {
    setView(next)
    saveView(next)
    if (next === 'day') {
      // Open on today if it's in the week being viewed, otherwise the first day of that week
      setSelectedDay(dayStrs.includes(today) ? today : dayStrs[0])
    }
  }

  function goPrev() {
    if (view === 'day') setSelectedDay(d => addDays(d, -1))
    else shiftWeek(-7)
  }
  function goNext() {
    if (view === 'day') setSelectedDay(d => addDays(d, 1))
    else shiftWeek(7)
  }
  function goToday() {
    setWeekStart(getWeekStart())
    setSelectedDay(today)
  }

  function shiftWeek(n) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + n)
    setWeekStart(d)
  }

  function weekLabel() {
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(days[0])} – ${fmt(days[6])}`
  }

  function navLabel() {
    if (view === 'week') return weekLabel()
    return fromDateStr(selectedDay).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Swipe left/right to change day in day view
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null || activeDragId) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) > 70) (dx < 0 ? goNext : goPrev)()
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

  // Shared context for marking meals cooked/eaten (pantry + fridge leftovers)
  function cookCtx() {
    return { householdId: household.id, userId: user?.id, settings, conversions, updateMeal, allPlans }
  }

  async function cookMeal(plan, cooked) {
    try {
      return await setMealCooked(plan, cooked, cookCtx())
    } finally {
      // Realtime pantry updates aren't reliable, so reload what cooking/undo changed
      refreshLeftovers()
      refreshPantry()
    }
  }

  async function toggleCooked(plan) {
    if (cookingIds.has(plan.id)) return
    const undoing = !!plan.cooked
    setCookingIds(prev => new Set([...prev, plan.id]))
    try {
      const { deducted, skipped, restored, notes } = await cookMeal(plan, !undoing)
      const name = mealName(plan)
      const leftover = isLeftoverSlot(plan)
      const parts = undoing
        ? [`${name} marked not ${leftover ? 'eaten' : 'cooked'}.`]
        : [`${leftover ? 'Ate' : 'Cooked'} ${name}.`]
      if (deducted.length) parts.push(`Updated ${deducted.length} pantry item${deducted.length !== 1 ? 's' : ''}.`)
      if (restored.length) parts.push(`Put back ${restored.length} pantry item${restored.length !== 1 ? 's' : ''}.`)
      if (skipped.length) parts.push(`Not deducted: ${skipped.join(', ')}.`)
      parts.push(...notes)
      // Offer a one-tap undo right after marking cooked/eaten
      const action = undoing ? null : {
        label: 'Undo',
        run: () => toggleCooked({ ...plan, cooked: true, pantry_deductions: deducted.map(d => ({
          id: d.id, name: d.name, unit: d.unit,
          amount: Math.round((Number(d.from) - Number(d.to)) * 1000) / 1000,
        })) }),
      }
      showToast(parts.join(' '), 8000, action)
    } catch (err) {
      showToast(`Couldn't update ${undoing ? 'the meal' : 'the pantry'}: ${err.message}`)
    } finally {
      setCookingIds(prev => { const s = new Set(prev); s.delete(plan.id); return s })
    }
  }

  async function addLeftoverSlot({ source, date, meal_type, servings }) {
    const { error } = await addMeal({
      date, meal_type, servings, is_leftover: true, leftover_of: source.id, recipe_id: source.recipe_id,
    })
    if (error) showToast(`Couldn't plan leftovers: ${error.message}`)
    return { error }
  }

  async function handleRemove(id) {
    const { error } = await removeMeal(id)
    if (error) showToast(`Couldn't remove meal: ${error.message}`)
    else if (id === openPlanId) setOpenPlanId(null) // removing a leftover slot keeps its cook open
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

  // Saves every visible row, so meal types that were only in use (like an old "snack") become regular rows
  async function handleReorder(next) {
    const { error } = await reorderMealTypes(next)
    if (error) showToast(`Couldn't save meal order: ${error.message}`)
  }

  function changeInverted(value) {
    setInverted(value)
    savePref(INVERT_KEY, value ? '1' : '0')
  }

  // What the AI sees about the planner
  function aiContext() {
    return {
      today,
      week: dayStrs.map((date, i) => ({ date, weekday: DAY_NAMES[i] })),
      ...(view === 'day' ? { viewing_day: selectedDay } : {}),
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
      householdId: household.id, plans, allPlans, leftovers, addRecipe, addMeal, updateMeal, removeMeal, conversions,
      setCooked: cookMeal,
    })
  }

  const rowRemovable = row =>
    extraMealTypes.includes(row) && !dayStrs.some(ds => plansBySlot[cellId(ds, row)]?.length)

  const weekGrid = (
    // The grid scrolls sideways on narrow screens; the meal labels stay pinned
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid min-w-[52rem]" style={{ gridTemplateColumns: '5.5rem repeat(7, minmax(0, 1fr))' }}>
        <div className="sticky left-0 z-10 bg-gray-50" />
        {days.map((d, i) => {
          const isToday = dayStrs[i] === today
          return (
            <button
              key={dayStrs[i]}
              onClick={() => changeViewTo('day', dayStrs[i])}
              className={`px-2 py-2 border-l border-gray-100 text-center hover:bg-gray-100 ${isToday ? 'bg-green-50' : 'bg-gray-50'}`}
              title="Open day view"
            >
              <p className={`text-xs font-semibold ${isToday ? 'text-green-700' : 'text-gray-700'}`}>{DAY_NAMES[i]}</p>
              <p className={`text-[11px] ${isToday ? 'text-green-600' : 'text-gray-400'}`}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </button>
          )
        })}

        {rows.map(row => (
          <div key={row} className="contents">
            <div className="sticky left-0 z-10 bg-white border-t border-gray-100 px-2 py-2 flex items-start justify-between gap-1">
              <span className="text-xs font-semibold text-gray-600 capitalize break-words">{row}</span>
              {rowRemovable(row) && (
                <button onClick={() => removeMealType(row)} className="text-[11px] text-gray-300 hover:text-red-500" aria-label={`Remove ${row} row`}>
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
                  className="min-h-[4.5rem] p-1 border-l border-t border-gray-100"
                >
                  {(plansBySlot[id] ?? []).map(plan => (
                    <DraggableMeal key={plan.id} plan={plan} onOpen={() => openMeal(plan.id)} />
                  ))}
                </DroppableCell>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )

  // Inverted week: days down the side, meal rows across the top
  const invertedGrid = (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `5.5rem repeat(${rows.length}, minmax(8rem, 1fr))`,
          minWidth: `${5.5 + rows.length * 8}rem`,
        }}
      >
        <div className="sticky left-0 z-10 bg-gray-50" />
        {rows.map(row => (
          <div key={row} className="px-2 py-2 border-l border-gray-100 bg-gray-50 flex items-center justify-center gap-1">
            <span className="text-xs font-semibold text-gray-700 capitalize">{row}</span>
            {rowRemovable(row) && (
              <button onClick={() => removeMealType(row)} className="text-[11px] text-gray-300 hover:text-red-500" aria-label={`Remove ${row} row`}>
                ✕
              </button>
            )}
          </div>
        ))}

        {days.map((d, i) => {
          const ds = dayStrs[i]
          const isToday = ds === today
          return (
            <div key={ds} className="contents">
              <button
                onClick={() => changeViewTo('day', ds)}
                className={`sticky left-0 z-10 border-t border-gray-100 px-2 py-2 text-left hover:bg-gray-100 ${isToday ? 'bg-green-50' : 'bg-white'}`}
                title="Open day view"
              >
                <p className={`text-xs font-semibold ${isToday ? 'text-green-700' : 'text-gray-700'}`}>{DAY_NAMES[i]}</p>
                <p className={`text-[11px] ${isToday ? 'text-green-600' : 'text-gray-400'}`}>
                  {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </button>
              {rows.map(row => {
                const id = cellId(ds, row)
                return (
                  <DroppableCell
                    key={id}
                    id={id}
                    isToday={isToday}
                    onAdd={() => setAssignSlot({ date: d, mealType: row })}
                    className="min-h-[4rem] p-1 border-l border-t border-gray-100"
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
  )

  function changeViewTo(next, day) {
    setView(next)
    saveView(next)
    if (day) setSelectedDay(day)
  }

  const dayView = (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Day picker for the week */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {days.map((d, i) => {
          const ds = dayStrs[i]
          const selected = ds === selectedDay
          const count = plans.filter(p => p.date === ds).length
          return (
            <button
              key={ds}
              onClick={() => setSelectedDay(ds)}
              className={`rounded-lg py-1.5 text-center border ${
                selected ? 'bg-green-600 border-green-600 text-white' : ds === today ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              <p className="text-[11px] font-medium">{DAY_NAMES[i]}</p>
              <p className="text-sm font-semibold leading-tight">{d.getDate()}</p>
              <p className={`text-[10px] ${selected ? 'text-green-100' : 'text-gray-400'}`}>{count ? `${count} meal${count !== 1 ? 's' : ''}` : '·'}</p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {rows.map(row => {
          const id = cellId(selectedDay, row)
          return (
            <div key={row} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="text-xs font-semibold text-gray-600 capitalize">{row}</span>
                {rowRemovable(row) && (
                  <button onClick={() => removeMealType(row)} className="text-[11px] text-gray-300 hover:text-red-500" aria-label={`Remove ${row} row`}>
                    ✕
                  </button>
                )}
              </div>
              <DroppableCell
                id={id}
                isToday={false}
                onAdd={() => setAssignSlot({ date: fromDateStr(selectedDay), mealType: row })}
                className="min-h-[3.5rem] px-2 pb-2 pt-1"
              >
                {(plansBySlot[id] ?? []).map(plan => (
                  <DraggableMeal key={plan.id} plan={plan} onOpen={() => openMeal(plan.id)} large />
                ))}
              </DroppableCell>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h1 className="text-xl font-bold text-gray-800">Meal Plan</h1>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={goPrev} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600" aria-label={view === 'day' ? 'Previous day' : 'Previous week'}>‹</button>
          <span className="text-gray-600 text-xs min-w-[6.5rem] text-center">{navLabel()}</span>
          <button onClick={goNext} className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600" aria-label={view === 'day' ? 'Next day' : 'Next week'}>›</button>
          <button onClick={goToday} className="ml-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
            Today
          </button>
          <button
            onClick={() => setShowViewOptions(true)}
            className="ml-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="View options"
          >
            ⚙ View
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
          {view === 'day' ? dayView : inverted ? invertedGrid : weekGrid}

          <DragOverlay dropAnimation={null}>
            {activePlan ? <div className={view === 'day' ? 'w-64' : 'w-32'}><MealCard plan={activePlan} dragging large={view === 'day'} /></div> : null}
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
        <p className="text-[11px] text-gray-400 ml-auto">
          {view === 'day' ? 'Swipe to change day · long-press a meal to drag' : 'Drag meals to move them · tap a day for day view'}
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm bg-gray-800 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50 flex items-start gap-3">
          <span className="flex-1">{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => { const { run } = toast.action; setToast(null); run() }}
              className="font-semibold text-green-300 hover:text-green-200 whitespace-nowrap"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {showViewOptions && (
        <ViewOptions
          view={view}
          onViewChange={changeView}
          inverted={inverted}
          onInvertChange={changeInverted}
          rows={rows}
          builtInRows={DEFAULT_MEAL_TYPES}
          onReorder={handleReorder}
          onClose={() => setShowViewOptions(false)}
        />
      )}

      {openPlan && (
        <MealDetailModal
          plan={openPlan}
          allPlans={allPlans}
          leftovers={leftovers}
          settings={settings}
          mealTypes={rows}
          pantryItems={pantryItems}
          cooking={cookingIds.has(openPlan.id)}
          onUpdate={updateMeal}
          onToggleCooked={toggleCooked}
          onRemove={handleRemove}
          onAddToList={addIngredientToList}
          onAddLeftover={addLeftoverSlot}
          onOpenPlan={setOpenPlanId}
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
