import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Postmark inbound address, e.g. "abc123@inbound.postmarkapp.com"
const INBOUND_BASE = import.meta.env.VITE_INBOUND_EMAIL_ADDRESS

export function useEmailImport(householdId, userId) {
  const [token, setToken] = useState(null)
  const [inboundEmails, setInboundEmails] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (householdId) fetchAll()
  }, [householdId])

  async function fetchAll() {
    if (!householdId) return
    setLoading(true)
    const [{ data: address }, { data: emails }] = await Promise.all([
      supabase.from('email_import_addresses').select('token').eq('household_id', householdId).maybeSingle(),
      supabase.from('inbound_emails').select('*').eq('household_id', householdId)
        .order('created_at', { ascending: false }).limit(10),
    ])
    setToken(address?.token ?? null)
    setInboundEmails(emails ?? [])
    setLoading(false)
  }

  async function createAddress() {
    const { data, error } = await supabase
      .from('email_import_addresses')
      .insert({ household_id: householdId, user_id: userId })
      .select('token')
      .single()
    if (!error) setToken(data.token)
    return { error }
  }

  async function resetAddress() {
    await supabase.from('email_import_addresses').delete().eq('household_id', householdId)
    setToken(null)
    return createAddress()
  }

  const address = token && INBOUND_BASE ? INBOUND_BASE.replace('@', `+${token}@`) : null

  return {
    configured: Boolean(INBOUND_BASE),
    address,
    inboundEmails,
    loading,
    fetchAll,
    createAddress,
    resetAddress,
  }
}
