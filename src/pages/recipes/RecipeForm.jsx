import { useState, useRef } from 'react'

const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch']
const CATEGORIES = ['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'snacks', 'other']

const EMPTY_INGREDIENT = { name: '', quantity: 1, unit: 'count', category: 'other' }

const DEFAULTS = {
  name: '',
  total_servings: 4,
  instructions: '',
  notes: '',
  rating: null,
  source_url: '',
  book_title: '',
  book_page: '',
  ingredients: [{ ...EMPTY_INGREDIENT }],
}

// pantryItems: [{ name, unit }]
// allIngredients: [{ name, unit, count }] sorted by frequency
export default function RecipeForm({ initial, onSave, onClose, pantryItems = [], allIngredients = [] }) {
  const [form, setForm] = useState(initial ? {
    name: initial.name,
    total_servings: initial.total_servings,
    instructions: initial.instructions ?? '',
    notes: initial.notes ?? '',
    rating: initial.rating ?? null,
    source_url: initial.source_url ?? '',
    book_title: initial.book_title ?? '',
    book_page: initial.book_page ?? '',
    ingredients: initial.recipe_ingredients?.length
      ? initial.recipe_ingredients.map(({ id, recipe_id, ...i }) => i)
      : [{ ...EMPTY_INGREDIENT }],
  } : DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [dropdownIdx, setDropdownIdx] = useState(null)
  const blurTimerRef = useRef(null)

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setIngredient(index, field, value) {
    setForm(f => {
      const ingredients = [...f.ingredients]
      ingredients[index] = { ...ingredients[index], [field]: value }
      return { ...f, ingredients }
    })
  }

  function addIngredient() {
    setForm(f => ({ ...f, ingredients: [...f.ingredients, { ...EMPTY_INGREDIENT }] }))
  }

  function removeIngredient(index) {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== index) }))
  }

  function getSuggestions(idx) {
    const typed = (form.ingredients[idx]?.name ?? '').trim()
    if (typed.length < 1) return []
    const lower = typed.toLowerCase()

    const pantryMatches = pantryItems
      .filter(p => p.name.toLowerCase().includes(lower))
      .slice(0, 5)
      .map(p => ({ name: p.name, unit: p.unit, fromPantry: true }))

    const pantryNames = new Set(pantryMatches.map(p => p.name.toLowerCase()))

    const recentMatches = allIngredients
      .filter(a => a.name.toLowerCase().includes(lower) && !pantryNames.has(a.name.toLowerCase()))
      .slice(0, 4)
      .map(a => ({ name: a.name, unit: a.unit, fromPantry: false }))

    return [...pantryMatches, ...recentMatches]
  }

  function selectSuggestion(idx, suggestion) {
    clearTimeout(blurTimerRef.current)
    setIngredient(idx, 'name', suggestion.name)
    if (suggestion.unit && UNITS.includes(suggestion.unit)) {
      setIngredient(idx, 'unit', suggestion.unit)
    }
    setDropdownIdx(null)
  }

  function handleIngredientBlur() {
    blurTimerRef.current = setTimeout(() => setDropdownIdx(null), 180)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      name: form.name.trim(),
      total_servings: Number(form.total_servings),
      instructions: form.instructions.trim() || null,
      notes: form.notes.trim() || null,
      rating: form.rating,
      source_url: form.source_url.trim() || null,
      book_title: form.book_title.trim() || null,
      book_page: form.book_page.trim() || null,
      ingredients: form.ingredients
        .filter(i => i.name.trim())
        .map(i => ({ ...i, quantity: Number(i.quantity) })),
    }
    await onSave(payload)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">
            {initial ? 'Edit Recipe' : 'New Recipe'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Recipe name *</label>
            <input
              autoFocus
              required
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="e.g. Chicken Stir Fry"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Servings */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Total servings *</label>
            <input
              required
              type="number"
              min="1"
              value={form.total_servings}
              onChange={e => setField('total_servings', e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Ingredients</label>
              <button
                type="button"
                onClick={addIngredient}
                className="text-xs text-green-600 hover:text-green-700 font-medium"
              >
                + Add ingredient
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {form.ingredients.map((ing, i) => {
                const suggestions = dropdownIdx === i ? getSuggestions(i) : []
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={ing.quantity}
                      onChange={e => setIngredient(i, 'quantity', e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="Qty"
                    />
                    <select
                      value={ing.unit}
                      onChange={e => setIngredient(i, 'unit', e.target.value)}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>

                    {/* Name with autocomplete */}
                    <div className="flex-1 relative">
                      <input
                        value={ing.name}
                        onChange={e => setIngredient(i, 'name', e.target.value)}
                        onFocus={() => setDropdownIdx(i)}
                        onBlur={handleIngredientBlur}
                        placeholder="Ingredient name"
                        autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-44 overflow-y-auto">
                          {suggestions.map((s, si) => (
                            <button
                              key={si}
                              type="button"
                              onMouseDown={() => selectSuggestion(i, s)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                            >
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${s.fromPantry ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                                {s.fromPantry ? 'pantry' : 'recent'}
                              </span>
                              <span className="text-gray-700 truncate">{s.name}</span>
                              {s.unit && s.unit !== 'count' && (
                                <span className="text-gray-400 text-xs shrink-0">({s.unit})</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {form.ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIngredient(i)}
                        className="text-gray-400 hover:text-red-400 text-lg leading-none shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Instructions <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={form.instructions}
              onChange={e => setField('instructions', e.target.value)}
              placeholder="Step-by-step instructions..."
              rows={5}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              placeholder="Tips, variations, substitutions..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          {/* Book reference */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Book title <span className="text-gray-400">(optional)</span>
              </label>
              <input
                value={form.book_title}
                onChange={e => setField('book_title', e.target.value)}
                placeholder="e.g. Salt, Fat, Acid, Heat"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Page <span className="text-gray-400">(opt)</span>
              </label>
              <input
                value={form.book_page}
                onChange={e => setField('book_page', e.target.value)}
                placeholder="42"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Source URL (shown if populated from import) */}
          {form.source_url && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Source URL</label>
              <input
                value={form.source_url}
                onChange={e => setField('source_url', e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-500"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : initial ? 'Save changes' : 'Save recipe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
