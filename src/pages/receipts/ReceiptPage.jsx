import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useHousehold } from '../../hooks/useHousehold'
import { useAuth } from '../../context/AuthContext'
import { usePantry } from '../../hooks/usePantry'

const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']

export default function ReceiptPage() {
  const { household } = useHousehold()
  const { user } = useAuth()
  const { addItem } = usePantry(household?.id)
  const fileRef = useRef()

  const [step, setStep] = useState('upload') // upload | scanning | review | done
  const [items, setItems] = useState([])
  const [storeName, setStoreName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setStep('scanning')

    // Convert to base64
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const base64 = evt.target.result.split(',')[1]
      const mimeType = file.type

      try {
        const { data, error } = await supabase.functions.invoke('ocr-receipt', {
          body: { imageBase64: base64, mimeType },
        })

        if (error || !data?.items) {
          showToast('Could not parse receipt — try a clearer photo')
          setStep('upload')
          return
        }

        setItems(data.items.map((item, i) => ({ ...item, id: i, selected: true })))
        setStep('review')
      } catch {
        showToast('OCR failed — check your network and try again')
        setStep('upload')
      }
    }
    reader.readAsDataURL(file)
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  async function handleConfirm() {
    setSaving(true)
    const selected = items.filter(i => i.selected)

    // Save receipt record
    const { data: receipt } = await supabase.from('receipts').insert({
      household_id: household.id,
      created_by: user.id,
      store_name: storeName || null,
      purchase_date: purchaseDate,
    }).select().single()

    // Add selected items to pantry
    for (const item of selected) {
      await addItem({
        name: item.name,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? 'count',
        category: item.category ?? 'other',
        storage_location: 'pantry',
        store_of_purchase: storeName || null,
        purchase_price: item.price ?? null,
        receipt_reference_id: receipt?.id ?? null,
      })
    }

    setSaving(false)
    setStep('done')
    showToast(`Added ${selected.length} items to pantry`)
  }

  function reset() {
    setStep('upload')
    setItems([])
    setStoreName('')
    setPurchaseDate(new Date().toISOString().split('T')[0])
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Scan Receipt</h1>

      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Store name (optional)</label>
              <input
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. Costco"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-green-300 rounded-2xl py-12 text-green-700 hover:bg-green-50 transition-colors"
          >
            <span className="text-5xl">📷</span>
            <span className="text-sm font-medium">Take a photo or upload receipt</span>
            <span className="text-xs text-gray-400">JPG, PNG, HEIC supported</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {step === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-5xl animate-pulse">🔍</div>
          <p className="text-gray-600 font-medium">Scanning receipt...</p>
          <p className="text-xs text-gray-400">Claude AI is extracting your items</p>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              Found <strong>{items.length}</strong> items — uncheck any you don't want to add
            </p>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">Start over</button>
          </div>

          <div className="flex flex-col gap-2 mb-4 max-h-[50vh] overflow-y-auto">
            {items.map(item => (
              <div key={item.id}
                className={`bg-white rounded-xl border p-3 transition-opacity ${!item.selected ? 'opacity-40' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={e => updateItem(item.id, 'selected', e.target.checked)}
                    className="mt-1 accent-green-600"
                  />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <input
                      value={item.name}
                      onChange={e => updateItem(item.id, 'name', e.target.value)}
                      className="text-sm font-medium text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-green-400 focus:outline-none bg-transparent"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <input
                        value={item.unit}
                        onChange={e => updateItem(item.id, 'unit', e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <select
                        value={item.category}
                        onChange={e => updateItem(item.id, 'category', e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {item.price != null && (
                        <span className="text-xs text-gray-400 self-center">${item.price}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirm}
            disabled={saving || items.filter(i => i.selected).length === 0}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Adding to pantry...' : `Add ${items.filter(i => i.selected).length} items to pantry`}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-5xl">✅</div>
          <p className="text-gray-800 font-medium">Items added to pantry</p>
          <button onClick={reset} className="text-green-600 text-sm hover:underline">Scan another receipt</button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
