import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useNutritionGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchGoals()
  }, [user])

  async function fetchGoals() {
    const { data } = await supabase
      .from('nutrition_goals')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    setGoals(data)
    setLoading(false)
  }

  async function saveGoals({ calories, protein, carbohydrates, fat, fiber }) {
    const payload = { user_id: user.id, calories, protein, carbohydrates, fat, fiber, updated_at: new Date().toISOString() }
    if (goals) {
      await supabase.from('nutrition_goals').update(payload).eq('user_id', user.id)
    } else {
      await supabase.from('nutrition_goals').insert(payload)
    }
    await fetchGoals()
  }

  return { goals, loading, saveGoals }
}
