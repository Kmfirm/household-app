import { useState } from 'react'

// A day's reminder on the planner: shows the text, click to edit, click away to save.
// Enter saves (Shift+Enter for a new line), Escape cancels; clearing the text deletes the note.
export default function DayNote({ text, onSave, className = '', placeholder = '+ note' }) {
  const [draft, setDraft] = useState(null) // null when not editing

  async function commit() {
    if (draft === null) return
    const value = draft
    setDraft(null)
    await onSave(value)
  }

  if (draft !== null) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') setDraft(null)
        }}
        rows={2}
        placeholder="e.g. Shelby working late"
        aria-label="Day note"
        className={`w-full resize-y rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400 ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(text ?? '')}
      className={`w-full text-left rounded px-1.5 py-1 text-xs whitespace-pre-wrap break-words ${
        text ? 'bg-amber-50 text-amber-900 hover:bg-amber-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
      } ${className}`}
      title={text ? 'Edit note' : 'Add a note for this day'}
    >
      {text || placeholder}
    </button>
  )
}
