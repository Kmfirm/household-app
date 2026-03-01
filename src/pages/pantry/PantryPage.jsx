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

export default function PantryPage() {
  const { household } = useHousehold()
  const { items, loading, addItem, updateItem, deleteItem } = usePantry(household?.id)
  const { getConversion, upsertConversion } = useUnitConversions(household?.id)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const filtered = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCategory === 'all' || item.category === filterCategory
    return matchSearch && matchCat
  })

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

      {/* Item count */}
      <p className="text-xs text-gray-400 mb-3">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>

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
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
              >
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
                    {item.quantity} {item.unit} · {item.storage_location}
                    {item.brand ? ` · ${item.brand}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 ml-3 shrink-0">
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
                </div>
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
