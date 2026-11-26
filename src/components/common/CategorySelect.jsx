import { useState } from 'react'

const NEW = '__new__'
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

// Category picklist with a "+ New category…" option that adds to the household's list
export default function CategorySelect({ value, onChange, categories, onAdd, className = '', labelCase = 'capitalize' }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const label = c => (labelCase === 'capitalize' ? capitalize(c) : c)
  // Keep an unknown current value selectable (e.g. a category added on another device)
  const options = value && !categories.includes(value) ? [...categories, value] : categories

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    const { name, error: err } = await onAdd(draft)
    setSaving(false)
    if (err) { setError(err.message); return }
    onChange(name)
    setAdding(false)
    setDraft('')
    setError(null)
  }

  function cancel() {
    setAdding(false)
    setDraft('')
    setError(null)
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') cancel()
            }}
            placeholder="New category"
            className={`${className} min-w-0`}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !draft.trim()}
            className="text-xs bg-green-600 text-white px-2 rounded-lg disabled:opacity-40 shrink-0"
          >
            {saving ? '…' : 'Add'}
          </button>
          <button type="button" onClick={cancel} className="text-xs text-gray-500 px-1 shrink-0">✕</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
      className={className}
    >
      {options.map(c => <option key={c} value={c}>{label(c)}</option>)}
      {onAdd && <option value={NEW}>+ New category…</option>}
    </select>
  )
}
