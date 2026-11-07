import { useState } from 'react'
import { usePantry } from '../../hooks/usePantry'
import { useHousehold } from '../../hooks/useHousehold'
import { useUnitConversions } from '../../hooks/useUnitConversions'
import ItemForm from './ItemForm'

const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']
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
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deletingSelected, setDeletingSelected] = useState(false)

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
    await deleteItems(selectedVisible.map(item => item.id))
    setDeletingSelected(false)
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
      await deleteItem(id)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Pantry</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
        >
          + Add Item
        </button>
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
          {CATEGORIES.map(c => (
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
                  {bought && (
                    <p className="text-xs text-gray-400 mt-1">
                      Bought {bought}{item.store_of_purchase ? ` at ${item.store_of_purchase}` : ''}
                    </p>
                  )}
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
