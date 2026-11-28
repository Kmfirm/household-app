import { useState } from 'react'
import { plannedQty } from '../../lib/mealPlanActions'
import { fromDateStr, addDaysStr } from '../../hooks/useMealPlan'
import {
  isLeftoverSlot, mealName, slotServings, slotLabel, shortDay,
  leftoverBudget, leftoverWarnings, fridgeRowFor,
} from '../../lib/leftovers'

const SCALE_OPTIONS = [0.5, 1, 1.5, 2, 3]
const scaleLabel = s => (s === 0.5 ? '½x' : `${s ?? 1}x`)
const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`

function getPantryMatch(ing, pantryItems) {
  return pantryItems.find(p =>
    p.name.toLowerCase().includes(ing.name.toLowerCase()) ||
    ing.name.toLowerCase().includes(p.name.toLowerCase())
  )
}

function ServingsInput({ value, onCommit }) {
  const [draft, setDraft] = useState(null)
  return (
    <input
      type="number" min="0.5" step="0.5"
      value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseFloat(draft)
        setDraft(null)
        if (n > 0 && n !== value) onCommit(n)
      }}
      className="w-14 text-right border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-green-400"
    />
  )
}

function RemoveButton({ count, onRemove }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-red-600">Also removes {plural(count, 'planned leftover meal')}.</p>
        <div className="flex gap-1">
          <button onClick={onRemove} className="bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs">Remove all</button>
          <button onClick={() => setConfirming(false)} className="text-gray-500 px-2 text-xs">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button
      onClick={() => (count ? setConfirming(true) : onRemove())}
      className="border border-red-200 text-red-500 rounded-lg px-3 py-2 text-sm hover:bg-red-50"
    >
      Remove
    </button>
  )
}

// Planning leftovers from a cook: servings budget, planned slots, add form
function LeftoverPlanner({ plan, allPlans, leftovers, settings, mealTypes, onUpdate, onRemoveSlot, onAddLeftover, onOpenPlan }) {
  const budget = leftoverBudget(plan, allPlans, settings)
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(addDaysStr(plan.date, 1))
  const [mealType, setMealType] = useState(mealTypes.includes('lunch') ? 'lunch' : mealTypes[0])
  const [servings, setServings] = useState(settings.servings_per_meal)
  const [saving, setSaving] = useState(false)
  const fridge = leftovers.find(l => l.source_meal_plan_id === plan.id)

  const dayOptions = Array.from({ length: 8 }, (_, i) => addDaysStr(plan.date, i))
  const tooLate = d => d > addDaysStr(plan.date, settings.leftover_days)

  async function add() {
    setSaving(true)
    const { error } = await onAddLeftover({ source: plan, date, meal_type: mealType, servings: Number(servings) || null })
    setSaving(false)
    if (!error) {
      setAdding(false)
      setDate(addDaysStr(date, 1))
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <p className="text-xs font-semibold text-gray-700 mb-1.5">♻ Leftovers</p>

      {budget.makes !== null ? (
        <p className="text-xs text-gray-600">
          Makes {plural(budget.makes, 'serving')}: {budget.own} at this meal
          {budget.planned ? ` · ${budget.planned} planned as leftovers` : ''}
          {' · '}
          <span className={budget.spare < 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
            {budget.spare < 0 ? `${-budget.spare} short` : `${budget.spare} spare`}
          </span>
        </p>
      ) : (
        <p className="text-xs text-gray-400">Set the recipe's servings to track how many leftovers it makes.</p>
      )}
      <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
        Servings at this meal:
        <ServingsInput value={budget.own} onCommit={n => onUpdate(plan.id, { servings: n })} />
      </p>

      {budget.suggestedScale && !plan.cooked && (
        <button
          onClick={() => onUpdate(plan.id, { scale: budget.suggestedScale, ingredient_overrides: {} })}
          className="mt-2 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-2.5 py-1 hover:bg-amber-100"
        >
          Cook {scaleLabel(budget.suggestedScale)} instead to cover everyone
        </button>
      )}

      {plan.cooked && fridge && (
        <p className="text-[11px] text-gray-500 mt-1">
          In the fridge now: {plural(Number(fridge.remaining_servings), 'serving')}
          {fridge.expiration_date ? ` · use by ${shortDay(fridge.expiration_date)}` : ''}
        </p>
      )}

      {budget.slots.length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          {budget.slots.map(slot => {
            const warnings = leftoverWarnings(slot, { source: plan, fridge: null, settings })
            return (
              <div key={slot.id} className="flex items-center gap-2 text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1">
                <button onClick={() => onOpenPlan(slot.id)} className="flex-1 text-left capitalize text-gray-700 hover:underline">
                  {slotLabel(slot)}
                  {slot.cooked && <span className="text-gray-400 normal-case"> · eaten</span>}
                  {warnings.length > 0 && <span className="text-amber-600 normal-case" title={warnings.join('\n')}> · ⚠ {warnings[0]}</span>}
                </button>
                <span className="text-gray-400">{plural(slotServings(slot, settings), 'serving')}</span>
                <button onClick={() => onRemoveSlot(slot.id)} className="text-gray-300 hover:text-red-500" aria-label="Remove leftover meal">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <select value={date} onChange={e => setDate(e.target.value)} className="border border-gray-200 rounded px-1.5 py-1">
            {dayOptions.map(d => (
              <option key={d} value={d}>
                {fromDateStr(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {tooLate(d) ? ' (past keep time)' : ''}
              </option>
            ))}
          </select>
          <select value={mealType} onChange={e => setMealType(e.target.value)} className="border border-gray-200 rounded px-1.5 py-1 capitalize">
            {mealTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="number" min="0.5" step="0.5" value={servings}
            onChange={e => setServings(e.target.value)}
            className="w-14 border border-gray-200 rounded px-1.5 py-1"
            aria-label="Servings"
          />
          <span className="text-gray-500">servings</span>
          <button onClick={add} disabled={saving} className="bg-green-600 text-white rounded px-2.5 py-1 disabled:opacity-40">
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setAdding(false)} className="text-gray-500 px-1">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 text-xs text-green-600 hover:text-green-800 font-medium">
          + Plan a leftover meal
        </button>
      )}
    </div>
  )
}

// Details for one planned meal
export default function MealDetailModal({
  plan, allPlans, leftovers, settings, mealTypes, pantryItems, shoppingItems = [], cooking,
  onUpdate, onToggleCooked, onRemove, onAddToList, onAddLeftover, onOpenPlan, onClose,
}) {
  const [qtyEdits, setQtyEdits] = useState({})
  const [adding, setAdding] = useState(new Set())

  const leftover = isLeftoverSlot(plan)
  const scale = plan.scale ?? 1
  const ingredients = plan.recipes?.recipe_ingredients ?? []
  const totalServings = plan.recipes?.total_servings
    ? Math.round(plan.recipes.total_servings * scale * 10) / 10
    : null
  const dateLabel = fromDateStr(plan.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const source = leftover && plan.leftover_of ? allPlans.find(p => p.id === plan.leftover_of) : null
  const fridge = leftover ? fridgeRowFor(plan, leftovers) : null
  const warnings = leftover ? leftoverWarnings(plan, { source, fridge, settings }) : []
  const slotCount = leftover ? 0 : allPlans.filter(p => p.leftover_of === plan.id).length

  async function changeScale(s) {
    setQtyEdits({})
    await onUpdate(plan.id, { scale: s, ingredient_overrides: {} })
  }

  async function saveQty(ing) {
    const raw = qtyEdits[ing.id]
    if (raw === undefined) return
    const parsed = parseFloat(raw)
    setQtyEdits(prev => { const n = { ...prev }; delete n[ing.id]; return n })
    if (isNaN(parsed)) return
    await onUpdate(plan.id, { ingredient_overrides: { ...(plan.ingredient_overrides ?? {}), [ing.id]: parsed } })
  }

  async function addToList(ing, qty) {
    setAdding(prev => new Set([...prev, ing.id]))
    await onAddToList(ing, qty, plan)
    setAdding(prev => { const s = new Set(prev); s.delete(ing.id); return s })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h2 className={`text-lg font-bold text-gray-800 ${plan.cooked ? 'line-through opacity-60' : ''}`}>
              {leftover ? '♻ ' : ''}{mealName(plan)}
            </h2>
            <p className="text-sm text-gray-500 capitalize">
              {plan.meal_type} · {dateLabel}
              {!leftover && totalServings !== null ? ` · makes ${plural(totalServings, 'serving')}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {leftover ? (
          <div className="flex flex-col gap-2 mt-3">
            <p className="text-sm text-gray-600">
              {source ? (
                <>Leftovers from{' '}
                  <button onClick={() => onOpenPlan(source.id)} className="text-green-700 hover:underline capitalize">
                    {slotLabel(source)}
                  </button>
                  {source.cooked ? ' (cooked)' : ''}
                </>
              ) : plan.leftover_id || fridge ? 'From your fridge leftovers' : 'Leftovers'}
            </p>
            {fridge && (
              <p className="text-xs text-gray-500">
                In the fridge: {plural(Number(fridge.remaining_servings), 'serving')}
                {fridge.expiration_date ? ` · use by ${shortDay(fridge.expiration_date)}` : ''}
              </p>
            )}
            {warnings.map(w => (
              <p key={w} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">⚠ {w}</p>
            ))}
            <p className="text-xs text-gray-600 flex items-center gap-1">
              Servings at this meal:
              <ServingsInput value={slotServings(plan, settings)} onCommit={n => onUpdate(plan.id, { servings: n })} />
            </p>
            <p className="text-[11px] text-gray-400">Leftover meals don't use pantry items or add to the shopping list.</p>
          </div>
        ) : (
          <>
            {/* Scale */}
            <div className="flex items-center gap-2 my-3 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Scale:</span>
              {SCALE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => changeScale(s)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                    scale === s ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {scaleLabel(s)}
                </button>
              ))}
              {totalServings !== null && (
                <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                  Makes
                  <ServingsInput
                    value={totalServings}
                    onCommit={n => changeScale(Math.round((n / plan.recipes.total_servings) * 10000) / 10000)}
                  />
                  servings
                </span>
              )}
            </div>

            {/* Ingredients */}
            {ingredients.length > 0 ? (
              <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                {ingredients.map(ing => {
                  const match = getPantryMatch(ing, pantryItems)
                  // Already added to the shopping list for this meal?
                  const listed = shoppingItems.find(i =>
                    i.meal_plan_ids?.includes(plan.id) && i.name.toLowerCase() === ing.name.toLowerCase())
                  const qty = qtyEdits[ing.id] ?? plannedQty(plan, ing)
                  return (
                    <div key={ing.id} className="flex items-center gap-2 text-xs text-gray-700">
                      <span className="flex-1 truncate">{ing.name}</span>
                      <input
                        type="number"
                        value={qty}
                        min="0"
                        step="0.25"
                        onChange={e => setQtyEdits(prev => ({ ...prev, [ing.id]: e.target.value }))}
                        onBlur={() => saveQty(ing)}
                        className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-green-400"
                      />
                      <span className="text-gray-400 w-10 truncate">{ing.unit}</span>
                      {match ? (
                        <span className="text-gray-400 whitespace-nowrap w-24 truncate text-right">
                          pantry: {Math.round(Number(match.quantity) * 100) / 100} {match.unit}
                        </span>
                      ) : plan.cooked ? (
                        <span className="text-gray-300 italic w-24 text-right">had it</span>
                      ) : listed ? (
                        <span className="w-24 text-center text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                          {listed.checked ? '✓ In cart' : '✓ On list'}
                        </span>
                      ) : (
                        <button
                          onClick={() => addToList(ing, qty)}
                          disabled={adding.has(ing.id)}
                          className="w-24 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
                        >
                          {adding.has(ing.id) ? 'Adding…' : '+ Shopping list'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-3">No ingredients</p>
            )}

            <LeftoverPlanner
              plan={plan}
              allPlans={allPlans}
              leftovers={leftovers}
              settings={settings}
              mealTypes={mealTypes}
              onUpdate={onUpdate}
              onRemoveSlot={onRemove}
              onAddLeftover={onAddLeftover}
              onOpenPlan={onOpenPlan}
            />
          </>
        )}

        <div className="flex gap-2 mt-5 items-end">
          <RemoveButton count={slotCount} onRemove={() => onRemove(plan.id)} />
          <button
            onClick={() => onToggleCooked(plan)}
            disabled={cooking}
            className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
              plan.cooked
                ? 'border border-green-600 text-green-700 hover:bg-green-50'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {cooking ? 'Saving…'
              : leftover ? (plan.cooked ? '✓ Eaten — undo' : 'Mark eaten')
              : plan.cooked ? '✓ Cooked — undo' : 'Mark cooked'}
          </button>
        </div>
      </div>
    </div>
  )
}
