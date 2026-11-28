import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  fetchDailyWeather, findLocation, getDeviceLocation, getSavedLocation, saveLocation,
} from '../lib/weather'

// Daily weather for [startStr, endStr] at the user's saved location, or where the device is.
// location: { label, lat, lon, saved } once known; status: 'loading' | 'ready' | 'no-location' | 'error'
export function useWeather(startStr, endStr) {
  const { user } = useAuth()
  const saved = getSavedLocation(user)
  const [deviceLoc, setDeviceLoc] = useState(null)
  const [deviceTried, setDeviceTried] = useState(false)
  // Last fetch: { key, days, failed } — key says which place/dates it was for
  const [result, setResult] = useState(null)

  // Ask the browser where we are only when nothing is saved
  useEffect(() => {
    if (saved || deviceTried) return
    let cancelled = false
    getDeviceLocation().then(loc => {
      if (cancelled) return
      setDeviceLoc(loc)
      setDeviceTried(true)
    })
    return () => { cancelled = true }
  }, [saved, deviceTried])

  const location = saved ? { ...saved, saved: true } : deviceLoc ? { ...deviceLoc, saved: false } : null
  const lat = location?.lat
  const lon = location?.lon

  const key = lat == null || lon == null ? null : `${lat},${lon}:${startStr}:${endStr}`

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchDailyWeather(lat, lon, startStr, endStr)
      .then(d => { if (!cancelled) setResult({ key, days: d, failed: false }) })
      .catch(() => { if (!cancelled) setResult({ key, days: {}, failed: true }) })
    return () => { cancelled = true }
  }, [key, lat, lon, startStr, endStr])

  const current = result?.key === key ? result : null
  const days = current?.days ?? {}
  const status = !key
    ? (!saved && deviceTried ? 'no-location' : 'loading')
    : !current ? 'loading' : current.failed ? 'error' : 'ready'

  // Look up a ZIP code / city and save it; returns { error } like supabase calls
  async function setLocation(query) {
    try {
      const loc = await findLocation(query)
      const { error } = await saveLocation(loc)
      return { error, location: loc }
    } catch (err) {
      return { error: err }
    }
  }

  // Forget the saved place and go back to the device's location
  async function switchToDeviceLocation() {
    setDeviceTried(false)
    setDeviceLoc(null)
    return saveLocation(null)
  }

  return { days, status, location, setLocation, switchToDeviceLocation }
}
