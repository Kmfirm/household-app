import { useState } from 'react'
import { CONVERTIBLE_UNITS, toOz } from '../../hooks/useUnitConversions'

function guessCountLabel(itemName) {
  const words = (itemName ?? '').toLowerCase().split(' ').filter(w => w.length > 2)
  return words[words.length - 1] ?? 'piece'
}

// Inline prompt to capture piece↔weight conversion data.
// For weight/volume units: asks "how many pieces is X lbs?"
// For count units: asks "how many oz is 1 piece?"
// Props:
//   itemName        - string, e.g. "Chicken Breast"
//   quantity        - number
//   unit            - string, e.g. "lbs" or "count"
//   existingConversion - object from unit_conversions or null
//   onSave(value, countLabel) - value is piece count (weight units) or oz/piece (count units)
//   onSkip          - called when user skips (optional)
export default function ConversionPrompt({ itemName, quantity, unit, existingConversion, onSave, onSkip }) {
  const [count, setCount] = useState('')
  const [countLabel, setCountLabel] = useState(
    existingConversion?.count_label ?? guessCountLabel(itemName)
  )
  const [saved, setSaved] = useState(false)

  if (saved) return null
  if (!itemName?.trim()) return null

  const isCountUnit = !CONVERTIBLE_UNITS.includes(unit?.toLowerCase())

  const totalOz = isCountUnit ? null : toOz(parseFloat(quantity) || 0, unit)
  const parsedCount = parseFloat(count)

  // For weight/volume: totalOz / pieces = oz each
  // For count: the user directly enters oz per piece
  const ozEach = isCountUnit
    ? (parsedCount > 0 ? parsedCount : null)
    : (parsedCount > 0 && totalOz ? totalOz / parsedCount : null)

  function handleSave() {
    if (!parsedCount || parsedCount <= 0) return
    onSave(parsedCount, countLabel)
    setSaved(true)
  }

  function handleSkip() {
    setSaved(true)
    onSkip?.()
  }

  return (
    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
      <p className="text-xs text-blue-700 font-medium mb-1.5">
        {isCountUnit
          ? `How many oz is 1 ${countLabel} of ${itemName}?`
          : `How many ${countLabel}s is ${quantity} ${unit} of ${itemName}?`}
        {existingConversion && (
          <span className="text-blue-400 font-normal ml-1">
            (saved: ~{(existingConversion.oz_per_count).toFixed(1)} oz/{existingConversion.count_label})
          </span>
        )}
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="number"
          min="0.1"
          step="any"
          value={count}
          onChange={e => setCount(e.target.value)}
          placeholder={isCountUnit ? 'oz' : 'qty'}
          className="w-14 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
        <input
          value={countLabel}
          onChange={e => setCountLabel(e.target.value)}
          placeholder="piece"
          className="w-20 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
        {ozEach && (
          <span className="text-xs text-blue-500">≈ {ozEach.toFixed(1)} oz each</span>
        )}
        <button
          onClick={handleSave}
          disabled={!parsedCount || parsedCount <= 0}
          className="text-xs bg-blue-600 text-white rounded px-2.5 py-1 disabled:opacity-40 hover:bg-blue-700"
        >
          Save
        </button>
        <button onClick={handleSkip} className="text-xs text-blue-400 hover:text-blue-600">
          Skip
        </button>
      </div>
    </div>
  )
}
