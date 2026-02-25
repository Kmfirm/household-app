import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useHousehold() {
  const { user } = useAuth()
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    fetchHousehold()
  }, [user])

  async function fetchHousehold() {
    setLoading(true)
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, role, households(id, name, invite_code)')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setHousehold(data.households)
    } else {
      setHousehold(null)
    }
    setLoading(false)
  }

  async function createHousehold(name) {
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .insert({ name, created_by: user.id })
      .select()
      .single()
    if (hhErr) return { error: hhErr }

    const { error: memErr } = await supabase
      .from('household_members')
      .insert({ household_id: hh.id, user_id: user.id, role: 'admin' })
    if (memErr) return { error: memErr }

    setHousehold(hh)
    return { data: hh }
  }

  async function joinHousehold(inviteCode) {
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .select()
      .eq('invite_code', inviteCode.toUpperCase())
      .single()
    if (hhErr || !hh) return { error: { message: 'Invalid invite code' } }

    const { error: memErr } = await supabase
      .from('household_members')
      .insert({ household_id: hh.id, user_id: user.id, role: 'member' })
    if (memErr) return { error: memErr }

    setHousehold(hh)
    return { data: hh }
  }

  return { household, loading, error, createHousehold, joinHousehold, refetch: fetchHousehold }
}
