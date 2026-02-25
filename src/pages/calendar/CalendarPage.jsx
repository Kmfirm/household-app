import { useState } from 'react'
import { useHousehold } from '../../hooks/useHousehold'
import { useRecipes } from '../../hooks/useRecipes'
import { usePantry } from '../../hooks/usePantry'
import { useMealPlan, getWeekStart, toDateStr } from '../../hooks/useMealPlan'
import AssignMealModal from './AssignMealModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_COLORS = {
  breakfast: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  lunch: 'bg-blue-50 border-blue-200 text-blue-800',
  dinner: 'bg-green-50 border-green-200 text-green-800',
  snack: 'bg-purple-50 border-purple-200 text-purple-800',
}

function getPantryGaps(recipe, pantryItems) {
  if (!recipe?.recipe_ingredients?.length) return []
  return recipe.recipe_ingredients.filter(ing => {
    const match = pantryItems.find(p =>
      p.name.toLowerCase().includes(ing.name.toLowerCase()) ||
      ing.name.toLowerCase().includes(p.name.toLowerCase())
    )
    return !match || match.quantity <= 0
  })
}

export default function CalendarPage() {
  const { household } = useHousehold()
  const { recipes } = useRecipes(household?.id)
  const { items: pantryItems } = usePantry(household?.id)
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const { plans, loading, addMeal, removeMeal } = useMealPlan(household?.id, weekStart)
  const [assignDay, setAssignDay] = useState(null) // date object

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
                      const gaps = getPantryGaps(plan.recipes, pantryItems)
                      return (
                        <div
                          key={plan.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${MEAL_COLORS[plan.meal_type]}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium capitalize">{plan.meal_type}</span>
                              <span className="text-xs font-semibold truncate">{plan.recipes?.name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs opacity-70">{plan.servings} serving{plan.servings !== 1 ? 's' : ''}</span>
                              {gaps.length > 0 && (
                                <span className="text-xs text-red-500 font-medium">
                                  ⚠ {gaps.length} missing ingredient{gaps.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeMeal(plan.id)}
                            className="text-xs opacity-50 hover:opacity-100 ml-2 shrink-0"
                          >
                            ✕
                          </button>
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
