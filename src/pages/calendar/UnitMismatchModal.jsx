import { useState } from 'react'
import { isMeasuredUnit } from '../../hooks/useUnitConversions'
import { conversionFor } from '../../lib/pantryDeduction'

const fmt = n => Math.round(Number(n) * 100) / 100

// After marking a meal cooked: asks how much was used of ingredients whose recipe unit
// doesn't match the pantry item's unit, and offers to remember the conversion.
// onSubmit([{ mismatch, amount, remember }]) — amount is in the pantry item's unit.
export default function UnitMismatchModal({ mealName, mismatches, onSubmit, onSkip }) {
  const [amounts, setAmounts] = useState({})
  const [remember, setRemember] = useState(() => Object.fromEntries(mismatches.map(m => [m.item.id + m.name, true])))
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    await onSubmit(mismatches.map(m => {
      const key = m.item.id + m.name
      return { mismatch: m, amount: parseFloat(amounts[key]) || 0, remember: !!remember[key] }
    }))
    setSaving(false)
  }

  const anyAmount = mismatches.some(m => parseFloat(amounts[m.item.id + m.name]) > 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-800">How much did you use?</h2>
        <p className="text-sm text-gray-500 mb-4">
          {mealName}: the recipe and your pantry measure {mismatches.length === 1 ? 'this' : 'these'} differently,
          so {mismatches.length === 1 ? 'it wasn\'t' : 'they weren\'t'} taken out of the pantry.
        </p>

        <div className="flex flex-col gap-4">
          {mismatches.map(m => {
            const key = m.item.id + m.name
            const amount = parseFloat(amounts[key])
            const conv = conversionFor(m, amount)
            const canRemember = isMeasuredUnit(m.unit) !== isMeasuredUnit(m.item.unit)
            return (
              <div key={key} className="border border-gray-200 rounded-xl p-3">
                <p className="text-sm font-medium text-gray-800">{m.name}</p>
                <p className="text-xs text-gray-500">
                  Recipe: {fmt(m.quantity)} {m.unit || 'each'} · Pantry ({m.item.name}): {fmt(m.item.quantity)} {m.item.unit || 'each'}
                </p>
                <label className="flex items-center gap-2 mt-2 text-sm text-gray-700">
                  Used
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={amounts[key] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-green-500"
                    aria-label={`Amount of ${m.item.name} used`}
                  />
                  <span className="text-gray-600">{m.item.unit || 'each'}</span>
                </label>
                {amount > fmt(m.item.quantity) && (
                  <p className="text-[11px] text-amber-700 mt-1">That's more than the pantry has; it will go to 0.</p>
                )}
                {canRemember && (
                  <label className="flex items-start gap-2 mt-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!remember[key]}
                      onChange={e => setRemember(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span>
                      Remember for next time
                      {conv ? ` (${fmt(conv.count)} ${conv.countUnit} ≈ ${fmt(conv.weight)} ${conv.weightUnit})` : ''}
                    </span>
                  </label>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onSkip} disabled={saving} className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
            Skip
          </button>
          <button
            onClick={submit}
            disabled={saving || !anyAmount}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Updating…' : 'Update pantry'}
          </button>
        </div>
      </div>
    </div>
  )
}
