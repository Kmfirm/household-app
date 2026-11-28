import { supabase } from './supabase'
import { addDaysStr, toDateStr } from '../hooks/useMealPlan'

// Daily weather for the meal planner, from Open-Meteo (free, no API key).
// A user's chosen location is saved on their account (auth user metadata `weather_location`:
// { label, lat, lon }); with none saved, the browser's current location is used.

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const ZIP_URL = 'https://api.zippopotam.us/us/'
const FORECAST_DAYS = 16 // how far ahead Open-Meteo forecasts
const PAST_DAYS = 90 // how far back it keeps recent days
const CACHE_MS = 60 * 60 * 1000

// Chance of rain (%) at or above which a day counts as "expected to rain"
export const RAIN_LIKELY = 40

// WMO weather codes: https://open-meteo.com/en/docs
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])

export function weatherIcon(day) {
  const c = day.code
  if (rainExpected(day)) {
    if (SNOW_CODES.has(c)) return '❄️'
    if (c >= 95) return '⛈️'
    return '🌧️'
  }
  // A small chance of showers isn't "expected to rain": show it as cloudy
  if (RAIN_CODES.has(c) || SNOW_CODES.has(c)) return '⛅'
  if (c === 45 || c === 48) return '🌫️'
  if (c === 0 || c === 1) return '☀️'
  if (c === 2) return '⛅'
  return '☁️'
}

// True when rain (or snow) is likely that day
export function rainExpected(day) {
  return day.rainChance >= RAIN_LIKELY
}

export function getSavedLocation(user) {
  const loc = user?.user_metadata?.weather_location
  return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) ? loc : null
}

// Save (or clear, with null) the user's weather location
export function saveLocation(loc) {
  return supabase.auth.updateUser({ data: { weather_location: loc } })
}

const US_STATES = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado',
  ct: 'connecticut', de: 'delaware', dc: 'district of columbia', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky',
  la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota',
  ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire',
  nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota',
  oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia',
  wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
}

// Turns a US ZIP code or a place name ("Hoboken", "Springfield, IL", "Paris, France")
// into { label, lat, lon }. Throws with a readable message when nothing matches.
export async function findLocation(query) {
  const q = query.trim()
  if (!q) throw new Error('Enter a ZIP code or city')

  const zip = q.match(/^(\d{5})(-\d{4})?$/)
  if (zip) {
    const res = await fetch(ZIP_URL + zip[1])
    if (!res.ok) throw new Error(`Couldn't find ZIP code ${zip[1]}`)
    const place = (await res.json()).places?.[0]
    if (!place) throw new Error(`Couldn't find ZIP code ${zip[1]}`)
    return {
      label: `${place['place name']}, ${place['state abbreviation']} ${zip[1]}`,
      lat: Number(place.latitude),
      lon: Number(place.longitude),
    }
  }

  const [name, ...rest] = q.split(',').map(s => s.trim()).filter(Boolean)
  const qualifier = rest.join(' ').toLowerCase()
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Location search is unavailable right now')
  const results = (await res.json()).results ?? []

  const state = US_STATES[qualifier] ?? qualifier
  const matches = qualifier
    ? results.filter(r =>
        [r.admin1, r.country, r.country_code].some(v => v && v.toLowerCase() === state))
    : results
  // With no state or country given, prefer a US place (the app shows °F)
  const best = qualifier ? matches[0] : (matches.find(r => r.country_code === 'US') ?? matches[0])
  if (!best) throw new Error(`Couldn't find "${q}"`)

  const region = best.country_code === 'US'
    ? Object.keys(US_STATES).find(k => US_STATES[k] === best.admin1?.toLowerCase())?.toUpperCase()
    : best.country
  return {
    label: region ? `${best.name}, ${region}` : best.name,
    lat: best.latitude,
    lon: best.longitude,
  }
}

// The browser's current location, or null if unavailable or not allowed
export function getDeviceLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ label: 'Current location', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { maximumAge: 30 * 60 * 1000, timeout: 10000 },
    )
  })
}

// { 'YYYY-MM-DD': { high, low, rainChance, code } } for the dates Open-Meteo covers in [startStr, endStr]
export async function fetchDailyWeather(lat, lon, startStr, endStr) {
  const today = toDateStr(new Date())
  const start = startStr < addDaysStr(today, -PAST_DAYS) ? addDaysStr(today, -PAST_DAYS) : startStr
  const end = endStr > addDaysStr(today, FORECAST_DAYS - 1) ? addDaysStr(today, FORECAST_DAYS - 1) : endStr
  if (start > end) return {}

  const la = lat.toFixed(2)
  const lo = lon.toFixed(2)
  const cacheKey = `weather:${la},${lo}:${start}:${end}`
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? 'null')
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.days
  } catch { /* ignore bad cache */ }

  const params = new URLSearchParams({
    latitude: la, longitude: lo,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    temperature_unit: 'fahrenheit', timezone: 'auto', start_date: start, end_date: end,
  })
  const res = await fetch(`${FORECAST_URL}?${params}`)
  if (!res.ok) throw new Error('Weather is unavailable right now')
  const { daily } = await res.json()
  const days = {}
  daily?.time?.forEach((date, i) => {
    const high = daily.temperature_2m_max[i]
    if (high == null) return
    days[date] = {
      high: Math.round(high),
      low: Math.round(daily.temperature_2m_min[i]),
      rainChance: daily.precipitation_probability_max[i] ?? 0,
      code: daily.weather_code[i],
    }
  })
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), days })) } catch { /* storage full */ }
  return days
}
