import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// The household's day notes (reminders like "Shelby working late") for [startStr, endStr].
// notes: { 'YYYY-MM-DD': 'text' }
export function useDayNotes(householdId, startStr, endStr) {
  const { user } = useAuth()
  const [loaded, setLoaded] = useState({ key: null, notes: {} })
  const key = householdId && startStr && endStr ? `${householdId}:${startStr}:${endStr}` : null

  useEffect(() => {
    if (!key) return
    let cancelled = false
    supabase
      .from('day_notes')
      .select('date, body')
      .eq('household_id', householdId)
      .gte('date', startStr)
      .lte('date', endStr)
      .then(({ data }) => {
        if (cancelled) return
        setLoaded({ key, notes: Object.fromEntries((data ?? []).map(n => [n.date, n.body])) })
      })
    return () => { cancelled = true }
  }, [key, householdId, startStr, endStr])

  const notes = loaded.key === key ? loaded.notes : {}

  // Saves a day's note; empty text deletes it. Returns { error }.
  async function saveNote(date, text) {
    const body = text.trim()
    const before = notes[date]
    if ((before ?? '') === body) return { error: null }
    setLoaded(prev => {
      const next = { ...prev.notes }
      if (body) next[date] = body
      else delete next[date]
      return { ...prev, notes: next }
    })
    const { error } = body
      ? await supabase.from('day_notes').upsert(
          { household_id: householdId, date, body, updated_by: user?.id, updated_at: new Date().toISOString() },
          { onConflict: 'household_id,date' },
        )
      : await supabase.from('day_notes').delete().eq('household_id', householdId).eq('date', date)
    if (error) {
      // Put back what was there
      setLoaded(prev => {
        const next = { ...prev.notes }
        if (before) next[date] = before
        else delete next[date]
        return { ...prev, notes: next }
      })
    }
    return { error }
  }

  return { notes, saveNote }
}
