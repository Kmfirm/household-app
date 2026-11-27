import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const DEFAULT_SETTINGS = { servings_per_meal: 2, leftover_days: 4 }

export function useHouseholdSettings(householdId) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    if (!householdId) return
    supabase
      .from('household_settings')
      .select('servings_per_meal, leftover_days')
      .eq('household_id', householdId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({
          servings_per_meal: Number(data.servings_per_meal) || DEFAULT_SETTINGS.servings_per_meal,
          leftover_days: Number(data.leftover_days) || DEFAULT_SETTINGS.leftover_days,
        })
      })
  }, [householdId])

  async function updateSettings(changes) {
    const before = settings
    const next = { ...settings, ...changes }
    setSettings(next)
    const { error } = await supabase
      .from('household_settings')
      .upsert({ household_id: householdId, ...next, updated_at: new Date().toISOString() })
    if (error) setSettings(before)
    return { error }
  }

  return { settings, updateSettings }
}
