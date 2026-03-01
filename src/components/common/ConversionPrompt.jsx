import { useState } from 'react'
import { CONVERTIBLE_UNITS, WEIGHT_UNITS, toOz } from '../../hooks/useUnitConversions'

function guessCountLabel(itemName) {
  const words = (itemName ?? '').toLowerCase().split(' ').filter(w => w.length > 2)
  return words[words.length - 1] ?? 'piece'
}

// Inline prompt to capture piece↔weight conversion data.
// For weight/volume units: asks "how many pieces is X lbs?" → calculates oz/piece
// For count units: asks "what is the total weight?" → calculates oz/piece from total ÷ quantity
// Props:
//   itemName        - string
//   quantity        - number
//   unit            - string, e.g. "lbs" or "count"
//   price           - number or string, optional (shows price/piece)
//   existingConversion - object from unit_conversions or null
//   onSave(ozPerPiece, countLabel) - for count units; or (pieceCount, countLabel) for weight units
//   onSkip          - called when user skips (optional)
export default function ConversionPrompt({ itemName, quantity, unit, price, existingConversion, onSave, onSkip }) {
  const [pieceCount, setPieceCount] = useState('')
  const [totalWeight, setTotalWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('oz')
  const [countLabel, setCountLabel] = useState(
    existingConversion?.count_label ?? guessCountLabel(itemName)
  )
  const [saved, setSaved] = useState(false)

  if (saved) return null
  if (!itemName?.trim()) return null

  const isCountUnit = !CONVERTIBLE_UNITS.includes(unit?.toLowerCase())
  const parsedQty = parseFloat(quantity) || 1
  const parsedPrice = price ? parseFloat(price) : null

  let ozEach = null
  let canSave = false
  let pricePerPiece = null

  if (isCountUnit) {
    const parsedWeight = parseFloat(totalWeight)
    if (parsedWeight > 0) {
      const totalOz = toOz(parsedWeight, weightUnit)
      if (totalOz) {
        ozEach = totalOz / parsedQty
        canSave = true
        if (parsedPrice > 0) pricePerPiece = parsedPrice / parsedQty
      }
    }
  } else {
    const parsed = parseFloat(pieceCount)
    const totalOz = toOz(parsedQty, unit)
    if (parsed > 0 && totalOz) {
      ozEach = totalOz / parsed
      canSave = true
      if (parsedPrice > 0) pricePerPiece = parsedPrice / parsed
    }
  }

  function handleSave() {
    if (!canSave) return
    // For count units: pass oz/piece directly. For weight/volume: pass piece count.
    onSave(isCountUnit ? ozEach : parseFloat(pieceCount), countLabel)
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
          ? `What is the total weight of ${parsedQty} ${countLabel}${parsedQty !== 1 ? 's' : ''}?`
          : `How many ${countLabel}s is ${quantity} ${unit} of ${itemName}?`}
        {existingConversion && (
          <span className="text-blue-400 font-normal ml-1">
            (saved: ~{existingConversion.oz_per_count.toFixed(2)} oz/{existingConversion.count_label})
          </span>
        )}
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        {isCountUnit ? (
          <>
            <input
              type="number"
              min="0.01"
              step="any"
              value={totalWeight}
              onChange={e => setTotalWeight(e.target.value)}
              placeholder="weight"
              className="w-16 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
            <select
              value={weightUnit}
              onChange={e => setWeightUnit(e.target.value)}
              className="border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none bg-white"
            >
              {WEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </>
        ) : (
          <input
            type="number"
            min="1"
            step="1"
            value={pieceCount}
            onChange={e => setPieceCount(e.target.value)}
            placeholder="qty"
            className="w-14 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
          />
        )}
        <input
          value={countLabel}
          onChange={e => setCountLabel(e.target.value)}
          placeholder="piece"
          className="w-20 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
        {ozEach != null && (
          <span className="text-xs text-blue-500">
            ≈ {ozEach.toFixed(2)} oz/{countLabel}
            {pricePerPiece != null && ` · $${pricePerPiece.toFixed(2)}/${countLabel}`}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={!canSave}
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
