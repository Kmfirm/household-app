import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { shrinkImage } from '../../lib/images'
import CategorySelect from '../../components/common/CategorySelect'

const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar']
const LOCATIONS = ['pantry', 'fridge', 'freezer', 'counter', 'shelf', 'other']
const MAX_PHOTOS_PER_MESSAGE = 4
const MAX_PHOTOS_SENT = 6 // most recent photos kept in the conversation

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + Math.round(days))
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Proposal from the AI -> editable row
function toRow(item, i, categories) {
  const unit = UNITS.includes(item.unit) ? item.unit : 'count'
  return {
    key: `${Date.now()}-${i}`,
    selected: true,
    name: item.name,
    quantity: item.quantity || 1,
    unit,
    category: categories.includes(item.category) ? item.category : 'other',
    storage_location: LOCATIONS.includes(item.storage_location) ? item.storage_location : 'pantry',
    brand: item.brand ?? '',
    expiration_date: item.estimated_freshness_days ? addDays(item.estimated_freshness_days) : '',
    estimated_freshness_days: item.estimated_freshness_days ?? null,
  }
}

export default function PantryAiModal({ categories, addCategory, existingItems, addItem, onClose, onAdded }) {
  const [messages, setMessages] = useState([]) // { role, content, images? }
  const [input, setInput] = useState('')
  const [photos, setPhotos] = useState([]) // pending { data, mimeType, previewUrl }
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const cameraRef = useRef(null)
  const libraryRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, sending, rows.length])

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

  // Sends the conversation with only the most recent photos attached, newest kept first
  function payloadMessages(all) {
    let budget = MAX_PHOTOS_SENT
    return [...all].reverse().map(m => {
      const images = (m.images ?? []).slice(0, Math.max(0, budget)).map(({ data, mimeType }) => ({ data, mimeType }))
      budget -= images.length
      return { role: m.role, content: m.content, images }
    }).reverse()
  }

  async function send() {
    const content = input.trim()
    if ((!content && !photos.length) || sending) return
    const userMsg = { role: 'user', content, images: photos }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setPhotos([])
    setSending(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('pantry-ai', {
        body: {
          messages: payloadMessages(next),
          context: {
            today: addDays(0),
            categories,
            // Helps the AI use names that match what's already tracked
            existing_pantry_items: [...new Set(existingItems.map(i => i.name))].slice(0, 200),
            // The list as the user sees it now (including their edits), so corrections build on it
            current_list: rows.filter(r => r.selected).map(r => ({
              name: r.name, quantity: Number(r.quantity) || 1, unit: r.unit, category: r.category,
              storage_location: r.storage_location, brand: r.brand || null,
            })),
          },
        },
      })
      if (fnError) {
        let msg = fnError.message
        try { const body = await fnError.context?.json(); if (body?.error) msg = body.error } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      // The AI always returns the full, updated list
      setRows((data.items ?? []).map((item, i) => toRow(item, i, categories)))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${err.message}`, error: true }])
    } finally {
      setSending(false)
    }
  }

  function updateRow(key, field, value) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }

  async function addSelected() {
    const chosen = rows.filter(r => r.selected && r.name.trim())
    if (!chosen.length) return
    setSaving(true)
    setError(null)
    let added = 0
    const failed = []
    for (const r of chosen) {
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
      if (err) failed.push(`${r.name}: ${err.message}`)
      else added++
    }
    setSaving(false)
    if (failed.length) {
      setError(`Added ${added}. Couldn't add: ${failed.join('; ')}`)
      setRows(prev => prev.filter(r => !r.selected || failed.some(f => f.startsWith(`${r.name}:`))))
      return
    }
    onAdded(added)
  }

  const selectedCount = rows.filter(r => r.selected).length
  const inputClass = 'border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">✨ Add items with AI</h2>
            <p className="text-xs text-gray-500">Describe what you bought or add photos. You review everything before it's added.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0 pb-2">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500">
              <p>Snap your produce, a fridge shelf, or a grocery haul — or just type, e.g. "6 bananas, a bag of baby carrots and 2 lbs of ground beef". I'll suggest quantities, where to store things, and when they'll go bad.</p>
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

          {/* Editable proposal */}
          {rows.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-2.5 bg-white">
              <p className="text-xs font-medium text-gray-500 mb-2">Items to add · edit anything before adding</p>
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
              <button
                onClick={addSelected}
                disabled={saving || !selectedCount}
                className="mt-2.5 w-full bg-green-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-green-700 disabled:opacity-40"
              >
                {saving ? 'Adding…' : `Add ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to pantry`}
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
              placeholder={rows.length ? 'Correct anything, e.g. "there are 8 apples, not 6"' : 'What did you get? (optional with photos)'}
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
