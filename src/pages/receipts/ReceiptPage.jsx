import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useHousehold } from '../../hooks/useHousehold'
import { useAuth } from '../../context/AuthContext'
import { usePantry } from '../../hooks/usePantry'
import { useReceipts } from '../../hooks/useReceipts'

const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']

export default function ReceiptPage() {
  const { household } = useHousehold()
  const { user } = useAuth()
  const { addItem } = usePantry(household?.id)
  const {
    receipts,
    loading: receiptsLoading,
    fetchReceipts,
    fetchReceiptItems,
    updateReceipt,
    updateReceiptItem,
    deleteReceiptItem,
    deleteReceipt,
    getImageUrl,
  } = useReceipts(household?.id)

  const fileRef = useRef()

  const [step, setStep] = useState('list') // list | upload | scanning | review | edit | done
  const [items, setItems] = useState([])
  const [storeName, setStoreName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [currentFile, setCurrentFile] = useState(null)

  // Edit mode state
  const [editReceipt, setEditReceipt] = useState(null)
  const [editImageUrl, setEditImageUrl] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setCurrentFile(file)
    setStep('scanning')

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const base64 = evt.target.result.split(',')[1]
      const mimeType = file.type

      try {
        const { data, error } = await supabase.functions.invoke('ocr-receipt', {
          body: { imageBase64: base64, mimeType },
        })

        if (error || !data?.items) {
          console.error('ocr-receipt error:', error, 'data:', data)
          showToast(error?.message || 'Could not parse receipt — try a clearer photo')
          setStep('upload')
          return
        }

        setItems(data.items.map((item, i) => ({ ...item, id: i, selected: true })))
        setStep('review')
      } catch (err) {
        console.error('ocr-receipt exception:', err)
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

    // Upload image to Supabase Storage
    let imagePath = null
    if (currentFile && household?.id) {
      const ext = currentFile.name.split('.').pop() || 'jpg'
      const path = `${household.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('receipt-images')
        .upload(path, currentFile, { contentType: currentFile.type })
      if (!uploadError) imagePath = path
    }

    // Calculate total
    const totalSpent = selected.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0)

    // Save receipt record
    const { data: receipt } = await supabase.from('receipts').insert({
      household_id: household.id,
      created_by: user.id,
      store_name: storeName || null,
      purchase_date: purchaseDate,
      image_path: imagePath,
      total_spent: totalSpent > 0 ? totalSpent : null,
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
    fetchReceipts()
  }

  async function handleOpenReceipt(receipt) {
    const receiptItems = await fetchReceiptItems(receipt.id)
    const imageUrl = await getImageUrl(receipt.image_path)
    setEditReceipt({ ...receipt })
    setEditImageUrl(imageUrl)
    setItems(receiptItems.map(item => ({ ...item, _dirty: false })))
    setStoreName(receipt.store_name ?? '')
    setPurchaseDate(receipt.purchase_date ?? new Date().toISOString().split('T')[0])
    setStep('edit')
  }

  function updateEditItem(id, field, value) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value, _dirty: true } : item
    ))
  }

  async function handleSaveEdit() {
    setSaving(true)

    await updateReceipt(editReceipt.id, {
      store_name: storeName || null,
      purchase_date: purchaseDate,
    })

    for (const item of items) {
      if (item._dirty) {
        await updateReceiptItem(item.id, {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          purchase_price: item.purchase_price,
        })
      }
    }

    setSaving(false)
    showToast('Changes saved')
    fetchReceipts()
  }

  async function handleDeleteEditItem(itemId) {
    await deleteReceiptItem(itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleAddEditItem() {
    const { data } = await supabase.from('pantry_items').insert({
      household_id: household.id,
      created_by: user.id,
      receipt_reference_id: editReceipt.id,
      name: 'New item',
      quantity: 1,
      unit: 'count',
      category: 'other',
      storage_location: 'pantry',
      store_of_purchase: storeName || null,
    }).select().single()
    if (data) setItems(prev => [...prev, { ...data, _dirty: false }])
  }

  async function handleDeleteReceipt(receiptId) {
    setDeletingId(receiptId)
    const { error } = await deleteReceipt(receiptId)
    setDeletingId(null)
    if (!error) {
      showToast('Receipt deleted')
      fetchReceipts()
      if (step === 'edit') backToList()
    }
  }

  function backToList() {
    setStep('list')
    setItems([])
    setEditReceipt(null)
    setEditImageUrl(null)
    setStoreName('')
    setPurchaseDate(new Date().toISOString().split('T')[0])
  }

  function reset() {
    setStep('list')
    setItems([])
    setStoreName('')
    setPurchaseDate(new Date().toISOString().split('T')[0])
    setCurrentFile(null)
    if (fileRef.current) fileRef.current.value = ''
    fetchReceipts()
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Receipts</h1>

      {/* LIST */}
      {step === 'list' && (
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setStep('upload')}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700"
          >
            + Scan New Receipt
          </button>

          {receiptsLoading && (
            <p className="text-sm text-gray-500 text-center py-4">Loading receipts...</p>
          )}

          {!receiptsLoading && receipts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No receipts yet — scan your first one!</p>
          )}

          <div className="flex flex-col gap-3">
            {receipts.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {r.store_name || 'Unknown store'} — {r.purchase_date}
                  </p>
                  {r.total_spent != null && (
                    <p className="text-xs text-gray-500 mt-0.5">${parseFloat(r.total_spent).toFixed(2)}</p>
                  )}
                </div>
                <button
                  onClick={() => handleOpenReceipt(r)}
                  className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 border border-green-200 rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this receipt and its pantry items?')) {
                      handleDeleteReceipt(r.id)
                    }
                  }}
                  disabled={deletingId === r.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 px-2 py-1"
                >
                  {deletingId === r.id ? '...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <button onClick={backToList} className="text-sm text-gray-500 hover:text-gray-700 self-start">
            ← Back
          </button>

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

      {/* SCANNING */}
      {step === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-5xl animate-pulse">🔍</div>
          <p className="text-gray-600 font-medium">Scanning receipt...</p>
          <p className="text-xs text-gray-400">Claude AI is extracting your items</p>
        </div>
      )}

      {/* REVIEW (create mode) */}
      {step === 'review' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              Found <strong>{items.length}</strong> items — uncheck any you don't want to add
            </p>
            <button onClick={() => setStep('upload')} className="text-xs text-gray-400 hover:text-gray-600">Start over</button>
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

      {/* EDIT (existing receipt) */}
      {step === 'edit' && editReceipt && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button onClick={backToList} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-green-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {editImageUrl && (
            <img
              src={editImageUrl}
              alt="Receipt"
              className="w-full rounded-xl border border-gray-200 max-h-64 object-contain bg-gray-50"
            />
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Store name</label>
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

          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <input
                      value={item.name}
                      onChange={e => updateEditItem(item.id, 'name', e.target.value)}
                      className="text-sm font-medium text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-green-400 focus:outline-none bg-transparent"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateEditItem(item.id, 'quantity', e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <input
                        value={item.unit}
                        onChange={e => updateEditItem(item.id, 'unit', e.target.value)}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <select
                        value={item.category}
                        onChange={e => updateEditItem(item.id, 'category', e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {item.purchase_price != null && (
                        <span className="text-xs text-gray-400 self-center">${item.purchase_price}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm('Remove this item from pantry?')) {
                        handleDeleteEditItem(item.id)
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-600 px-1 py-1 mt-0.5"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddEditItem}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors"
          >
            + Add Item
          </button>

          <button
            onClick={() => {
              if (window.confirm('Delete this receipt and all its pantry items?')) {
                handleDeleteReceipt(editReceipt.id)
              }
            }}
            className="w-full border border-red-200 text-red-500 rounded-xl py-2.5 text-sm hover:bg-red-50 transition-colors"
          >
            Delete Receipt
          </button>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-5xl">✅</div>
          <p className="text-gray-800 font-medium">Items added to pantry</p>
          <button onClick={reset} className="text-green-600 text-sm hover:underline">View receipt history</button>
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
