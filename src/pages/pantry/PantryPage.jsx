import { useState } from 'react'
import { usePantry } from '../../hooks/usePantry'
import { useHousehold } from '../../hooks/useHousehold'
import { useUnitConversions } from '../../hooks/useUnitConversions'
import { useCategories } from '../../hooks/useCategories'
import ItemForm from './ItemForm'
import PantryAiModal from './PantryAiModal'

const CATEGORY_COLORS = {
  produce: 'bg-green-100 text-green-700',
  dairy: 'bg-blue-100 text-blue-700',
  meat: 'bg-red-100 text-red-700',
  frozen: 'bg-cyan-100 text-cyan-700',
  pantry: 'bg-yellow-100 text-yellow-700',
  beverages: 'bg-purple-100 text-purple-700',
  snacks: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
}

function expirationStatus(expDate) {
  if (!expDate) return null
  const days = Math.ceil((new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (days < 0) return { label: 'Expired', color: 'text-red-600 bg-red-50' }
  if (days <= 3) return { label: `${days}d left`, color: 'text-red-500 bg-red-50' }
  if (days <= 7) return { label: `${days}d left`, color: 'text-yellow-600 bg-yellow-50' }
  return { label: `${days}d left`, color: 'text-gray-400 bg-gray-50' }
}

// Prefer the receipt's purchase date; fall back to when the item was added
function purchaseDate(item) {
  if (item.receipts?.purchase_date) {
    // Parse YYYY-MM-DD as a local date so it doesn't shift a day in US time zones
    const [y, m, d] = item.receipts.purchase_date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return item.date_added ? new Date(item.date_added) : null
}

function formatPurchaseDate(item) {
  const date = purchaseDate(item)
  if (!date) return null
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

const formatQty = q => String(Math.round(Number(q) * 100) / 100)

function remaining(item) {
  const qty = Number(item.quantity)
  const bought = Number(item.purchased_quantity)
  if (!bought || qty >= bought) return { label: `${formatQty(qty)} ${item.unit} left`, pct: bought ? 1 : null }
  const pct = Math.max(0, qty / bought)
  return { label: `${formatQty(qty)} of ${formatQty(bought)} ${item.unit} left`, pct }
}

function formatUnitPrice(item) {
  const p = Number(item.unit_price)
  if (!p || !item.unit_price_unit) return null
  // Tiny per-fl-oz prices read better with three decimals
  const digits = p < 0.1 ? 3 : 2
  return `$${p.toFixed(digits)}/${item.unit_price_unit}`
}

function formatPackage(item) {
  const size = Number(item.package_size)
  const count = Number(item.pack_count)
  const sizeText = size && item.package_unit ? `${formatQty(size)} ${item.package_unit}` : null
  if (count > 1) return `${formatQty(count)}-pack${sizeText ? ` · ${sizeText} each` : ''}`
  return sizeText
}

const NUTRITION_ROWS = [
  ['calories', 'Calories', ''],
  ['protein', 'Protein', 'g'],
  ['carbohydrates', 'Carbs', 'g'],
  ['sugar', 'Sugar', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['fat', 'Fat', 'g'],
  ['saturated_fat', 'Sat. fat', 'g'],
  ['sodium', 'Sodium', 'mg'],
]

function NutritionPanel({ product }) {
  const rows = NUTRITION_ROWS.filter(([key]) => product[key] != null)
  return (
    <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-2.5">
      <p className="text-xs font-medium text-gray-600 mb-1.5">
        Per serving{product.serving_size ? ` · ${product.serving_size}` : ''}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
        {rows.map(([key, label, unit]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-800 font-medium">{formatQty(product[key])}{unit}</span>
          </div>
        ))}
      </div>
      {product.source && (
        <p className="text-[10px] text-gray-400 mt-1.5">
          Source: {product.source.split('+').map(s => (s === 'usda' ? 'USDA' : 'Open Food Facts')).join(' + ')}
        </p>
      )}
    </div>
  )
}

const barColor = pct => (pct > 0.5 ? 'bg-green-500' : pct > 0.2 ? 'bg-yellow-400' : 'bg-red-400')

const byName = (a, b) => a.name.localeCompare(b.name)
const byDate = (a, b) => (purchaseDate(a)?.getTime() ?? 0) - (purchaseDate(b)?.getTime() ?? 0)

const SORTS = {
  name: { label: 'Name', compare: byName },
  type: { label: 'Type', compare: (a, b) => a.category.localeCompare(b.category) || byName(a, b) },
  newest: { label: 'Newest purchase', compare: (a, b) => byDate(b, a) || byName(a, b) },
  oldest: { label: 'Oldest purchase', compare: (a, b) => byDate(a, b) || byName(a, b) },
}

export default function PantryPage() {
  const { household } = useHousehold()
  const { items, loading, addItem, updateItem, deleteItem, deleteItems } = usePantry(household?.id)
  const { getConversion, upsertConversion } = useUnitConversions(household?.id)
  const { categories, addCategory } = useCategories(household?.id)
  const [showAi, setShowAi] = useState(false)
  const [toast, setToast] = useState(null)
  // Also offer any category already on an item (e.g. one added on another device)
  const filterCategories = [...new Set([...categories, ...items.map(i => i.category).filter(Boolean)])]
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deletingSelected, setDeletingSelected] = useState(false)
  const [nutritionOpen, setNutritionOpen] = useState(new Set())

  function toggleNutrition(id) {
    setNutritionOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCategory === 'all' || item.category === filterCategory
    return matchSearch && matchCat
  }).sort(SORTS[sortBy].compare)

  // Only count selections that are still visible under the current search/filter
  const selectedVisible = filtered.filter(item => selectedIds.has(item.id))
  const allVisibleSelected = filtered.length > 0 && selectedVisible.length === filtered.length

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filtered.map(item => item.id)))
  }

  function exitSelecting() {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  async function handleDeleteSelected() {
    const count = selectedVisible.length
    if (!confirm(`Remove ${count} item${count !== 1 ? 's' : ''} from the pantry?`)) return
    setDeletingSelected(true)
    const { error, deletedCount } = await deleteItems(selectedVisible.map(item => item.id))
    setDeletingSelected(false)
    if (error) {
      alert(`Couldn't delete items: ${error.message}`)
      return
    }
    if (deletedCount < count) alert(`Only ${deletedCount} of ${count} items could be deleted.`)
    exitSelecting()
  }

  async function handleSave(data) {
    if (editItem) {
      await updateItem(editItem.id, data)
    } else {
      await addItem(data)
    }
    setShowForm(false)
    setEditItem(null)
  }

  function handleEdit(item) {
    setEditItem(item)
    setShowForm(true)
  }

  async function handleDelete(id) {
    if (confirm('Remove this item from the pantry?')) {
      const { error, deletedCount } = await deleteItem(id)
      if (error || !deletedCount) alert(`Couldn't delete item${error ? `: ${error.message}` : ''}`)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Pantry</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAi(true)}
            className="bg-purple-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-purple-700"
          >
            ✨ AI
          </button>
          <button
            onClick={() => { setEditItem(null); setShowForm(true) }}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="all">All</option>
          {filterCategories.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Item count, sort & select */}
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs text-gray-400 flex-1">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          Sort
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </label>
        {filtered.length > 0 && (
          <button
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 border border-green-200 rounded-lg"
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selecting && (
        <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2 mb-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 flex-1">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="accent-green-600" />
            {selectedVisible.length > 0 ? `${selectedVisible.length} selected` : 'Select all'}
          </label>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedVisible.length === 0 || deletingSelected}
            className="text-xs bg-red-500 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-40"
          >
            {deletingSelected ? 'Deleting...' : `Delete${selectedVisible.length ? ` (${selectedVisible.length})` : ''}`}
          </button>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🥫</p>
          <p className="text-sm">Your pantry is empty</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-green-600 text-sm hover:underline"
          >
            Add your first item
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(item => {
            const exp = expirationStatus(item.expiration_date)
            const left = remaining(item)
            const bought = formatPurchaseDate(item)
            const isSelected = selectedIds.has(item.id)
            const unitPrice = formatUnitPrice(item)
            const pkg = formatPackage(item)
            const product = item.product_catalog?.lookup_status === 'found' ? item.product_catalog : null
            const hasNutrition = product?.calories != null
            const showNutrition = hasNutrition && nutritionOpen.has(item.id)
            return (
              <div
                key={item.id}
                onClick={selecting ? () => toggleSelected(item.id) : undefined}
                className={`bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between ${
                  selecting ? 'cursor-pointer' : ''
                } ${isSelected ? 'border-green-400 ring-1 ring-green-400' : 'border-gray-100'}`}
              >
                {selecting && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(item.id)}
                    onClick={e => e.stopPropagation()}
                    className="mr-3 accent-green-600 shrink-0"
                    aria-label={`Select ${item.name}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm">{item.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other}`}>
                      {item.category}
                    </span>
                    {exp && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${exp.color}`}>
                        {exp.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {left.label} · {item.storage_location}
                    {item.brand ? ` · ${item.brand}` : ''}
                  </p>
                  {left.pct != null && (
                    <div className="mt-1.5 h-1.5 w-full max-w-48 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(left.pct)}`} style={{ width: `${left.pct * 100}%` }} />
                    </div>
                  )}
                  {(pkg || unitPrice) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {[pkg, unitPrice].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {bought && (
                    <p className="text-xs text-gray-400 mt-1">
                      Bought {bought}{item.store_of_purchase ? ` at ${item.store_of_purchase}` : ''}
                    </p>
                  )}
                  {hasNutrition && !selecting && (
                    <button
                      onClick={() => toggleNutrition(item.id)}
                      className="text-xs text-green-600 hover:text-green-800 font-medium mt-1"
                    >
                      {showNutrition ? 'Hide nutrition ▲' : `Nutrition · ${formatQty(product.calories)} cal/serving ▼`}
                    </button>
                  )}
                  {showNutrition && <NutritionPanel product={product} />}
                </div>
                {!selecting && <div className="flex gap-2 ml-3 shrink-0">
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded"
                  >
                    Delete
                  </button>
                </div>}
              </div>
            )
          })}
        </div>
      )}

      {showAi && (
        <PantryAiModal
          categories={categories}
          addCategory={addCategory}
          existingItems={items}
          addItem={addItem}
          updateItem={updateItem}
          deleteItems={deleteItems}
          onClose={() => setShowAi(false)}
          onDone={({ added, removed, reduced }) => {
            setShowAi(false)
            const plural = n => `${n} item${n !== 1 ? 's' : ''}`
            const parts = [
              added ? `Added ${plural(added)}` : null,
              removed ? `removed ${plural(removed)}` : null,
              reduced ? `updated ${plural(reduced)}` : null,
            ].filter(Boolean).join(', ')
            setToast(parts ? `${parts.charAt(0).toUpperCase()}${parts.slice(1)}.` : 'No changes made.')
            setTimeout(() => setToast(null), 3500)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm bg-gray-800 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <ItemForm
          initial={editItem}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          existingConversion={editItem ? getConversion(editItem.name) : null}
          onConversionSave={(name, qty, unit, count, label) =>
            upsertConversion(name, qty, unit, count, label)
          }
        />
      )}
    </div>
  )
}
