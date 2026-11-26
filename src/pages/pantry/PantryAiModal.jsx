import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { shrinkImage } from '../../lib/images'
import CategorySelect from '../../components/common/CategorySelect'

const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar']
const LOCATIONS = ['pantry', 'fridge', 'freezer', 'counter', 'shelf', 'other']
const MAX_PHOTOS_PER_MESSAGE = 4
const MAX_PHOTOS_SENT = 6 // most recent photos kept in the conversation
const MAX_PANTRY_CONTEXT = 300

const fmtQty = q => String(Math.round(Number(q) * 100) / 100)

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + Math.round(days))
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function boughtOn(item) {
  return item.receipts?.purchase_date ?? item.date_added?.split('T')[0] ?? null
}

function shortDate(ymd) {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// AI proposal -> editable "add" row
function toAddRow(item, i, categories) {
  return {
    key: `a-${Date.now()}-${i}`,
    selected: true,
    name: item.name,
    quantity: item.quantity || 1,
    unit: UNITS.includes(item.unit) ? item.unit : 'count',
    category: categories.includes(item.category) ? item.category : 'other',
    storage_location: LOCATIONS.includes(item.storage_location) ? item.storage_location : 'pantry',
    brand: item.brand ?? '',
    expiration_date: item.estimated_freshness_days ? addDays(item.estimated_freshness_days) : '',
    estimated_freshness_days: item.estimated_freshness_days ?? null,
  }
}

// AI proposal -> editable "remove" row (dropped if the item id isn't in the pantry)
function toRemovalRow(r, i, itemsById) {
  const item = itemsById.get(r.item_id)
  if (!item) return null
  const qty = Number(item.quantity) || 0
  const reduce = r.action === 'reduce' && r.amount > 0 && r.amount < qty
  return {
    key: `r-${Date.now()}-${i}`,
    selected: true,
    item_id: item.id,
    action: reduce ? 'reduce' : 'delete',
    amount: reduce ? r.amount : qty,
    reason: r.reason ?? '',
  }
}

export default function PantryAiModal({ categories, addCategory, existingItems, addItem, updateItem, deleteItems, onClose, onDone }) {
  const [messages, setMessages] = useState([]) // { role, content, images? }
  const [input, setInput] = useState('')
  const [photos, setPhotos] = useState([]) // pending { data, mimeType, previewUrl }
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState([])
  const [removalRows, setRemovalRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const cameraRef = useRef(null)
  const libraryRef = useRef(null)
  const endRef = useRef(null)

  const itemsById = new Map(existingItems.map(i => [i.id, i]))

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending, rows.length, removalRows.length])

  async function handleFiles(fileList) {
    const files = [...(fileList ?? [])].slice(0, MAX_PHOTOS_PER_MESSAGE - photos.length)
    if (!files.length) return
    setError(null)
    try {
      const shrunk = await Promise.all(files.map(f => shrinkImage(f)))
      setPhotos(prev => [...prev, ...shrunk].slice(0, MAX_PHOTOS_PER_MESSAGE))
    } catch (err) {
      setError(err.message)
    }
  }

  // Sends the conversation with only the most recent photos attached
  function payloadMessages(all) {
    let budget = MAX_PHOTOS_SENT
    return [...all].reverse().map(m => {
      const images = (m.images ?? []).slice(0, Math.max(0, budget)).map(({ data, mimeType }) => ({ data, mimeType }))
      budget -= images.length
      return { role: m.role, content: m.content, images }
    }).reverse()
  }

  function buildContext() {
    return {
      today: addDays(0),
      categories,
      // Current pantry, so the AI can match names and point at items to remove
      pantry_items: existingItems.slice(0, MAX_PANTRY_CONTEXT).map(i => ({
        id: i.id,
        name: i.name,
        brand: i.brand_name ?? i.brand ?? null,
        quantity: Number(i.quantity),
        unit: i.unit,
        storage_location: i.storage_location,
        bought: boughtOn(i),
        use_by: i.expiration_date ?? null,
      })),
      // What the user sees right now (including their edits), so corrections build on it
      current_list: rows.filter(r => r.selected).map(r => ({
        name: r.name, quantity: Number(r.quantity) || 1, unit: r.unit, category: r.category,
        storage_location: r.storage_location, brand: r.brand || null,
      })),
      current_removals: removalRows.filter(r => r.selected).map(r => ({
        item_id: r.item_id, action: r.action, amount: r.action === 'reduce' ? Number(r.amount) : null, reason: r.reason,
      })),
    }
  }

  async function send() {
    const content = input.trim()
    if ((!content && !photos.length) || sending) return
    const next = [...messages, { role: 'user', content, images: photos }]
    setMessages(next)
    setInput('')
    setPhotos([])
    setSending(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('pantry-ai', {
        body: { messages: payloadMessages(next), context: buildContext() },
      })
      if (fnError) {
        let msg = fnError.message
        try { const body = await fnError.context?.json(); if (body?.error) msg = body.error } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      // The AI always returns the full, updated lists
      setRows((data.items ?? []).map((item, i) => toAddRow(item, i, categories)))
      const seen = new Set()
      setRemovalRows((data.removals ?? [])
        .map((r, i) => toRemovalRow(r, i, itemsById))
        .filter(r => r && !seen.has(r.item_id) && seen.add(r.item_id)))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${err.message}`, error: true }])
    } finally {
      setSending(false)
    }
  }

  function updateRow(key, field, value) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }
  function updateRemoval(key, field, value) {
    setRemovalRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }

  async function applyChanges() {
    const adds = rows.filter(r => r.selected && r.name.trim())
    const removals = removalRows.filter(r => r.selected && itemsById.has(r.item_id))
    if (!adds.length && !removals.length) return
    setSaving(true)
    setError(null)
    const failed = []
    let added = 0
    let removed = 0
    let reduced = 0

    for (const r of adds) {
      const { error: err } = await addItem({
        name: r.name.trim(),
        quantity: Number(r.quantity) || 1,
        unit: r.unit,
        category: r.category,
        storage_location: r.storage_location,
        brand: r.brand.trim() || null,
        expiration_date: r.expiration_date || null,
        estimated_freshness_days: r.estimated_freshness_days,
      })
      if (err) failed.push(`add ${r.name}: ${err.message}`)
      else added++
    }

    // Partial use: lower the quantity, or remove the item if nothing is left
    const toDelete = removals.filter(r => r.action === 'delete')
    for (const r of removals.filter(r => r.action === 'reduce')) {
      const item = itemsById.get(r.item_id)
      const left = Math.round((Number(item.quantity) - (Number(r.amount) || 0)) * 1000) / 1000
      if (left <= 0) { toDelete.push(r); continue }
      const { error: err } = await updateItem(item.id, { quantity: left })
      if (err) failed.push(`update ${item.name}: ${err.message}`)
      else reduced++
    }

    if (toDelete.length) {
      const { error: err, deletedCount } = await deleteItems(toDelete.map(r => r.item_id))
      if (err) failed.push(`remove items: ${err.message}`)
      removed = deletedCount ?? 0
    }

    setSaving(false)
    if (failed.length) {
      setError(`Some changes failed: ${failed.join('; ')}`)
      return
    }
    onDone({ added, removed, reduced })
  }

  const addCount = rows.filter(r => r.selected).length
  const removeCount = removalRows.filter(r => r.selected).length
  const totalCount = addCount + removeCount
  const inputClass = 'border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">✨ Update pantry with AI</h2>
            <p className="text-xs text-gray-500">Add or remove items by text or photo. You review everything before it's saved.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0 pb-2">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500 flex flex-col gap-2">
              <p>Snap your produce, a fridge shelf, or a grocery haul — or just type. I'll suggest quantities, where to store things, and when they'll go bad.</p>
              <p>You can also tell me what's gone: "we finished the milk", "threw out the spinach", "used 3 eggs".</p>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={m.role === 'user' ? 'self-end max-w-[85%] flex flex-col items-end gap-1' : 'self-start max-w-[90%]'}>
              {m.images?.length > 0 && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {m.images.map((img, i) => (
                    <img key={i} src={img.previewUrl} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                  ))}
                </div>
              )}
              {m.content && (
                <div className={`text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-green-600 text-white rounded-br-sm'
                    : m.error ? 'bg-red-50 text-red-700 rounded-bl-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              )}
            </div>
          ))}

          {sending && <div className="self-start bg-gray-100 text-gray-500 text-sm rounded-2xl rounded-bl-sm px-3 py-2">Looking…</div>}

          {(rows.length > 0 || removalRows.length > 0) && (
            <div className="border border-gray-200 rounded-xl p-2.5 bg-white flex flex-col gap-3">
              {/* Additions */}
              {rows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-2">➕ To add · edit anything before saving</p>
                  <div className="flex flex-col gap-2">
                    {rows.map(r => (
                      <div key={r.key} className={`flex flex-col gap-1.5 rounded-lg border p-2 ${r.selected ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={r.selected} onChange={e => updateRow(r.key, 'selected', e.target.checked)} className="accent-green-600" />
                          <input value={r.name} onChange={e => updateRow(r.key, 'name', e.target.value)} className={`${inputClass} flex-1 min-w-0 text-sm font-medium`} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-6">
                          <input type="number" min="0" step="any" value={r.quantity} onChange={e => updateRow(r.key, 'quantity', e.target.value)} className={`${inputClass} w-16`} />
                          <select value={r.unit} onChange={e => updateRow(r.key, 'unit', e.target.value)} className={inputClass}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <CategorySelect
                            value={r.category}
                            onChange={v => updateRow(r.key, 'category', v)}
                            categories={categories}
                            onAdd={addCategory}
                            labelCase="lower"
                            className={inputClass}
                          />
                          <select value={r.storage_location} onChange={e => updateRow(r.key, 'storage_location', e.target.value)} className={inputClass}>
                            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-gray-500">
                            Use by
                            <input type="date" value={r.expiration_date} onChange={e => updateRow(r.key, 'expiration_date', e.target.value)} className={inputClass} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removals */}
              {removalRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-2">➖ To remove or use up</p>
                  <div className="flex flex-col gap-2">
                    {removalRows.map(r => {
                      const item = itemsById.get(r.item_id)
                      if (!item) return null
                      const bought = shortDate(boughtOn(item))
                      return (
                        <div key={r.key} className={`flex flex-col gap-1.5 rounded-lg border p-2 ${r.selected ? 'border-red-100 bg-red-50/40' : 'border-gray-100 opacity-50'}`}>
                          <div className="flex items-start gap-2">
                            <input type="checkbox" checked={r.selected} onChange={e => updateRemoval(r.key, 'selected', e.target.checked)} className="accent-red-500 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{item.name}</p>
                              <p className="text-[11px] text-gray-500">
                                {fmtQty(item.quantity)} {item.unit} · {item.storage_location}
                                {bought ? ` · bought ${bought}` : ''}
                                {r.reason ? ` · ${r.reason}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-gray-600">
                            <select
                              value={r.action}
                              onChange={e => updateRemoval(r.key, 'action', e.target.value)}
                              className={inputClass}
                            >
                              <option value="delete">Remove entirely</option>
                              <option value="reduce">Use some</option>
                            </select>
                            {r.action === 'reduce' && (
                              <>
                                <input
                                  type="number" min="0" step="any" value={r.amount}
                                  onChange={e => updateRemoval(r.key, 'amount', e.target.value)}
                                  className={`${inputClass} w-16`}
                                />
                                <span>
                                  {item.unit} → {fmtQty(Math.max(0, Number(item.quantity) - (Number(r.amount) || 0)))} {item.unit} left
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={applyChanges}
                disabled={saving || !totalCount}
                className="w-full bg-green-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-green-700 disabled:opacity-40"
              >
                {saving ? 'Saving…' : [
                  addCount ? `Add ${addCount}` : null,
                  removeCount ? `${addCount ? 'remove/update' : 'Remove/update'} ${removeCount}` : null,
                ].filter(Boolean).join(', ') || 'Nothing selected'}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="pt-2 border-t border-gray-100">
          {photos.length > 0 && (
            <div className="flex gap-1.5 mb-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p.previewUrl} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-gray-700 text-white rounded-full w-5 h-5 text-[10px]"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); send() }} className="flex gap-2 items-end">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => cameraRef.current?.click()} disabled={photos.length >= MAX_PHOTOS_PER_MESSAGE}
                className="text-lg border border-gray-200 rounded-lg w-10 h-9 hover:bg-gray-50 disabled:opacity-30" aria-label="Take photo" title="Take photo">
                📷
              </button>
              <button type="button" onClick={() => libraryRef.current?.click()} disabled={photos.length >= MAX_PHOTOS_PER_MESSAGE}
                className="text-lg border border-gray-200 rounded-lg w-10 h-9 hover:bg-gray-50 disabled:opacity-30" aria-label="Choose photos" title="Choose photos">
                🖼️
              </button>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={3}
              placeholder={rows.length || removalRows.length
                ? 'Correct anything, e.g. "there are 8 apples, not 6"'
                : 'What did you buy, finish or throw out?'}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button type="submit" disabled={sending || (!input.trim() && !photos.length)}
              className="bg-purple-600 text-white text-sm font-medium rounded-lg px-4 h-[4.75rem] hover:bg-purple-700 disabled:opacity-40">
              Send
            </button>
          </form>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
        </div>
      </div>
    </div>
  )
}
