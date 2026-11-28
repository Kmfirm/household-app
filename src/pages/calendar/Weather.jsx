import { useState } from 'react'
import { weatherIcon, rainExpected } from '../../lib/weather'

// High/low (°F) for one day, plus the chance of rain when rain is expected
export function DayWeather({ day, compact = false, light = false }) {
  if (!day) return null
  const rain = rainExpected(day)
  const muted = light ? 'text-green-100' : 'text-gray-400'
  const rainColor = light ? 'text-white' : 'text-blue-600'
  return (
    <span
      className={`flex items-center justify-center gap-1 flex-wrap leading-tight ${compact ? 'text-[10px]' : 'text-[11px]'}`}
      title={`High ${day.high}°F, low ${day.low}°F${day.rainChance ? `, ${day.rainChance}% chance of rain` : ''}`}
    >
      <span aria-hidden="true">{weatherIcon(day)}</span>
      <span className={light ? 'text-white font-medium' : 'text-gray-700 font-medium'}>{day.high}°</span>
      <span className={muted}>{day.low}°</span>
      {rain && <span className={`${rainColor} font-medium`}>💧{day.rainChance}%</span>}
    </span>
  )
}

// Small control showing where the weather is for; opens the location dialog
export function WeatherLocationButton({ weather, onClick }) {
  const { location, status } = weather
  const label = location?.label ?? (status === 'no-location' ? 'Set weather location' : 'Weather…')
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 max-w-[10rem] truncate"
      title="Weather location"
    >
      📍 {label}
    </button>
  )
}

export function WeatherLocationModal({ weather, onClose }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { location } = weather

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await weather.setLocation(query)
    setBusy(false)
    if (err) setError(err.message ?? 'Could not save that location')
    else onClose()
  }

  async function useDevice() {
    setBusy(true)
    setError(null)
    const { error: err } = await weather.switchToDeviceLocation()
    setBusy(false)
    if (err) setError(err.message)
    else onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-800">Weather location</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {location
            ? <>Showing weather for <span className="font-medium text-gray-700">{location.label}</span>.</>
            : weather.status === 'no-location'
              ? "Your browser didn't share your location. Enter a ZIP code or city."
              : 'Finding your location…'}
        </p>

        <form onSubmit={save} className="flex flex-col gap-2">
          <label htmlFor="weather-location" className="text-xs font-medium text-gray-600">ZIP code or city</label>
          <div className="flex gap-2">
            <input
              id="weather-location"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. 07030 or Hoboken, NJ"
              autoFocus
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="submit"
              disabled={busy || !query.trim()}
              className="bg-green-600 text-white rounded-lg px-4 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? '…' : 'Save'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>

        {location?.saved && (
          <button
            onClick={useDevice}
            disabled={busy}
            className="mt-4 text-xs text-green-700 hover:underline disabled:opacity-50"
          >
            Use my current location instead
          </button>
        )}
        <p className="text-[11px] text-gray-400 mt-3">Saved to your account. Forecasts cover about the next 16 days.</p>
      </div>
    </div>
  )
}
