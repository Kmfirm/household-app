import { useState } from 'react'
import ConversionPrompt from '../../components/common/ConversionPrompt'

const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']
const LOCATIONS = ['pantry', 'fridge', 'freezer', 'counter', 'shelf', 'other']
const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar']

const DEFAULTS = {
  name: '',
  quantity: 1,
  unit: 'count',
  category: 'other',
  storage_location: 'pantry',
  brand: '',
  expiration_date: '',
  store_of_purchase: '',
  purchase_price: '',
}

export default function ItemForm({ initial, onSave, onClose, existingConversion, onConversionSave }) {
  const [form, setForm] = useState(initial ? {
    ...DEFAULTS,
    ...initial,
    expiration_date: initial.expiration_date ?? '',
    purchase_price: initial.purchase_price ?? '',
    brand: initial.brand ?? '',
    store_of_purchase: initial.store_of_purchase ?? '',
  } : DEFAULTS)
  const [loading, setLoading] = useState(false)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      name: form.name.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      category: form.category,
      storage_location: form.storage_location,
      brand: form.brand || null,
      expiration_date: form.expiration_date || null,
      store_of_purchase: form.store_of_purchase || null,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
    }
    await onSave(payload)
    setLoading(false)
  }

  function handleConversionSave(count, countLabel) {
    onConversionSave?.(form.name.trim(), form.quantity, form.unit, count, countLabel)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">
            {initial ? 'Edit Item' : 'Add Pantry Item'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Item name *</label>
            <input
              autoFocus
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Chicken breast"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Quantity + Unit */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity *</label>
              <input
                required
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Unit *</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Conversion prompt — shown for weight/volume units */}
          {onConversionSave && (
            <ConversionPrompt
              itemName={form.name}
              quantity={form.quantity}
              unit={form.unit}
              price={form.purchase_price}
              existingConversion={existingConversion}
              onSave={handleConversionSave}
              onSkip={() => {}}
            />
          )}

          {/* Category + Location */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Category *</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Location *</label>
              <select
                value={form.storage_location}
                onChange={e => set('storage_location', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {LOCATIONS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Brand */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Brand <span className="text-gray-400">(optional)</span></label>
            <input
              value={form.brand}
              onChange={e => set('brand', e.target.value)}
              placeholder="e.g. Tyson"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Expiration date */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Expiration date <span className="text-gray-400">(optional)</span></label>
            <input
              type="date"
              value={form.expiration_date}
              onChange={e => set('expiration_date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Store + Price */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Store <span className="text-gray-400">(optional)</span></label>
              <input
                value={form.store_of_purchase}
                onChange={e => set('store_of_purchase', e.target.value)}
                placeholder="e.g. Costco"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Price <span className="text-gray-400">(optional)</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price}
                onChange={e => set('purchase_price', e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : initial ? 'Save changes' : 'Add to pantry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
