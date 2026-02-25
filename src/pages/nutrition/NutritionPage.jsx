import { useState } from 'react'
import { useHousehold } from '../../hooks/useHousehold'
import { useNutrition } from '../../hooks/useNutrition'
import { useNutritionGoals } from '../../hooks/useNutritionGoals'

function MacroBar({ label, value, max, color }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}g{max ? ` / ${max}g` : ''}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function NutritionPage() {
  const { household } = useHousehold()
  const { logs, loading, searchUSDA, saveProfile, logConsumption, deleteLog, todayTotals, refetch } = useNutrition(household?.id)
  const { goals, saveGoals } = useNutritionGoals()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [servings, setServings] = useState(1)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState(null)
  const [showLog, setShowLog] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [goalForm, setGoalForm] = useState(null)
  const [savingGoals, setSavingGoals] = useState(false)

  const totals = todayTotals()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function openGoals() {
    setGoalForm({
      calories: goals?.calories ?? 2000,
      protein: goals?.protein ?? 150,
      carbohydrates: goals?.carbohydrates ?? 250,
      fat: goals?.fat ?? 65,
      fiber: goals?.fiber ?? 25,
    })
    setShowGoals(true)
  }

  async function handleSaveGoals(e) {
    e.preventDefault()
    setSavingGoals(true)
    await saveGoals({
      calories: Number(goalForm.calories),
      protein: Number(goalForm.protein),
      carbohydrates: Number(goalForm.carbohydrates),
      fat: Number(goalForm.fat),
      fiber: Number(goalForm.fiber),
    })
    setSavingGoals(false)
    setShowGoals(false)
    showToast('Goals saved!')
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    setSelected(null)
    const foods = await searchUSDA(query)
    setResults(foods)
    setSearching(false)
  }

  async function handleLog() {
    if (!selected) return
    setLogging(true)
    const { data: saved } = await saveProfile({
      item_name: selected.name,
      calories: selected.calories,
      protein: selected.protein,
      carbohydrates: selected.carbohydrates,
      fat: selected.fat,
      fiber: selected.fiber,
      sugar: selected.sugar,
      sodium: selected.sodium,
      serving_size: selected.serving_size,
      source: 'usda',
      usda_fdc_id: selected.fdc_id,
    })
    await logConsumption({ item_name: selected.name, servings_consumed: Number(servings), profile: saved })
    await refetch()
    setLogging(false)
    setSelected(null)
    setQuery('')
    setResults([])
    showToast('Logged!')
  }

  const calorieGoal = goals?.calories ?? 2000
  const caloriePct = Math.min(100, Math.round((totals.calories / calorieGoal) * 100))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-800">Nutrition</h1>
        <button onClick={openGoals} className="text-xs text-green-600 hover:underline">Edit goals</button>
      </div>
      <p className="text-sm text-gray-400 mb-4">{today}</p>

      {/* Daily summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Today's totals</h2>
          <button onClick={() => setShowLog(v => !v)} className="text-xs text-green-600 hover:underline">
            {showLog ? 'Hide log' : 'View log'}
          </button>
        </div>

        {/* Calorie ring / progress */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={caloriePct > 100 ? '#ef4444' : '#22c55e'} strokeWidth="3.5"
                strokeDasharray={`${caloriePct} 100`} strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold text-gray-800">{Math.round(totals.calories)}</span>
              <span className="text-xs text-gray-400">kcal</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-2">
              {calorieGoal - Math.round(totals.calories) > 0
                ? `${calorieGoal - Math.round(totals.calories)} kcal remaining`
                : `${Math.round(totals.calories) - calorieGoal} kcal over goal`}
            </p>
            <div className="flex flex-col gap-1.5">
              <MacroBar label="Protein" value={totals.protein} max={goals?.protein ?? 150} color="bg-blue-400" />
              <MacroBar label="Carbs" value={totals.carbs} max={goals?.carbohydrates ?? 250} color="bg-yellow-400" />
              <MacroBar label="Fat" value={totals.fat} max={goals?.fat ?? 65} color="bg-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Today's log */}
      {showLog && logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Today's log</h2>
          <div className="flex flex-col gap-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-800">{log.item_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{log.servings_consumed} serving{log.servings_consumed !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-3">
                  {log.calories_total && (
                    <span className="text-xs text-orange-500 font-medium">{Math.round(log.calories_total)} kcal</span>
                  )}
                  <button onClick={() => { deleteLog(log.id); refetch() }} className="text-gray-300 hover:text-red-400">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Food search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Log food</h2>
        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search food (e.g. chicken breast)..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button type="submit" disabled={searching}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {searching ? '...' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3 max-h-48 overflow-y-auto">
            {results.map(food => (
              <button
                key={food.fdc_id}
                onClick={() => setSelected(food)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selected?.fdc_id === food.fdc_id
                    ? 'border-green-400 bg-green-50 text-green-800'
                    : 'border-gray-100 hover:border-gray-300 text-gray-700'
                }`}
              >
                <p className="font-medium text-xs">{food.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {food.calories ?? '?'} kcal · P: {food.protein ?? '?'}g · C: {food.carbohydrates ?? '?'}g · F: {food.fat ?? '?'}g
                  {food.serving_size ? ` · per ${food.serving_size}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <div className="flex-1 text-xs text-gray-600">
              <span className="font-medium">{selected.name}</span>
              <span className="text-gray-400 ml-1">— {selected.calories ?? '?'} kcal/serving</span>
            </div>
            <input
              type="number" min="0.5" step="0.5" value={servings}
              onChange={e => setServings(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <span className="text-xs text-gray-400">servings</span>
            <button onClick={handleLog} disabled={logging}
              className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {logging ? '...' : 'Log'}
            </button>
          </div>
        )}
      </div>

      {/* Goals modal */}
      {showGoals && goalForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Daily nutrition goals</h2>
            <form onSubmit={handleSaveGoals} className="flex flex-col gap-3">
              {[
                { key: 'calories', label: 'Calories', unit: 'kcal' },
                { key: 'protein', label: 'Protein', unit: 'g' },
                { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g' },
                { key: 'fat', label: 'Fat', unit: 'g' },
                { key: 'fiber', label: 'Fiber', unit: 'g' },
              ].map(({ key, label, unit }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 w-28">{label}</label>
                  <input
                    type="number" min="0" value={goalForm[key]}
                    onChange={e => setGoalForm(f => ({ ...f, [key]: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                  <span className="text-xs text-gray-400 w-8">{unit}</span>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setShowGoals(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={savingGoals}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {savingGoals ? 'Saving...' : 'Save goals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
