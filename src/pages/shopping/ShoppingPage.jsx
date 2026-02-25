import { useState } from 'react'
import { useHousehold } from '../../hooks/useHousehold'
import { usePantry } from '../../hooks/usePantry'
import { useShoppingList } from '../../hooks/useShoppingList'

const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']
const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp']

const EMPTY_FORM = { name: '', quantity: 1, unit: 'count', category: 'other', store: '' }

export default function ShoppingPage() {
  const { household } = useHousehold()
  const { items: pantryItems } = usePantry(household?.id)
  const {
    items, loading,
    addItem, toggleChecked, deleteItem, clearChecked,
    generateFromMealPlan, addCheckedToPantry,
  } = useShoppingList(household?.id)

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [generating, setGenerating] = useState(false)
  const [moving, setMoving] = useState(false)
  const [toast, setToast] = useState(null)

  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  // Group unchecked items by category
  const grouped = unchecked.reduce((acc, item) => {
    const cat = item.category ?? 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleGenerate() {
    setGenerating(true)
    const { count, error } = await generateFromMealPlan(pantryItems)
    setGenerating(false)
    if (error) {
      showToast('Error generating list')
    } else if (count === 0) {
      showToast('Your pantry covers all planned meals this week')
    } else {
      showToast(`Added ${count} missing ingredient${count !== 1 ? 's' : ''} from this week's meal plan`)
    }
  }

  async function handleMoveToPantry() {
    setMoving(true)
    const { count, error } = await addCheckedToPantry()
    setMoving(false)
    if (!error && count > 0) {
      showToast(`Moved ${count} item${count !== 1 ? 's' : ''} to pantry`)
    }
  }

  async function handleAddItem(e) {
    e.preventDefault()
    await addItem({
      name: form.name.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      category: form.category,
      store: form.store.trim() || null,
      auto_generated: false,
    })
    setForm(EMPTY_FORM)
    setShowAddForm(false)
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Shopping List</h1>
        <div className="flex gap-2">
          {checked.length > 0 && (
            <button
              onClick={clearChecked}
              className="text-xs text-gray-400 hover:text-red-500 px-3 py-2 border border-gray-200 rounded-lg"
            >
              Clear checked
            </button>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Generate from meal plan */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-green-300 text-green-700 rounded-xl py-3 text-sm font-medium hover:bg-green-50 disabled:opacity-50 transition-colors"
      >
        {generating ? 'Generating...' : '✨ Generate from this week\'s meal plan'}
      </button>

      {/* Add item form */}
      {showAddForm && (
        <form onSubmit={handleAddItem} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <input
            autoFocus
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Item name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <select
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input
            value={form.store}
            onChange={e => setForm(f => ({ ...f, store: e.target.value }))}
            placeholder="Store (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700">Add item</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🛒</p>
          <p className="text-sm">Your shopping list is empty</p>
          <p className="text-xs mt-1">Generate from your meal plan or add items manually</p>
        </div>
      ) : (
        <>
          {/* Unchecked items grouped by category */}
          {Object.keys(grouped).sort().map(category => (
            <div key={category} className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 px-1">
                {category}
              </p>
              <div className="flex flex-col gap-1.5">
                {grouped[category].map(item => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleChecked(item.id, !item.checked)}
                    onDelete={() => deleteItem(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Checked items */}
          {checked.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  In cart ({checked.length})
                </p>
                <button
                  onClick={handleMoveToPantry}
                  disabled={moving}
                  className="text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
                >
                  {moving ? 'Moving...' : '→ Add to pantry'}
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {checked.map(item => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleChecked(item.id, !item.checked)}
                    onDelete={() => deleteItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

function ShoppingItem({ item, onToggle, onDelete }) {
  return (
    <div className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm transition-opacity ${item.checked ? 'opacity-50 border-gray-100' : 'border-gray-100'}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
        }`}
      >
        {item.checked && <span className="text-xs">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {item.name}
        </span>
        <p className="text-xs text-gray-400">
          {item.quantity} {item.unit}
          {item.store ? ` · ${item.store}` : ''}
          {item.auto_generated ? ' · from meal plan' : ''}
        </p>
      </div>
      <button
        onClick={onDelete}
        className="text-gray-300 hover:text-red-400 text-sm shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
