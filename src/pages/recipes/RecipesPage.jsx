import { useState, useMemo, useRef } from 'react'
import { useRecipes } from '../../hooks/useRecipes'
import { useHousehold } from '../../hooks/useHousehold'
import { usePantry } from '../../hooks/usePantry'
import { supabase } from '../../lib/supabase'
import RecipeForm from './RecipeForm'
import RecipeDetail from './RecipeDetail'

function StarRating({ rating }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(rating ?? 0)}{'☆'.repeat(5 - (rating ?? 0))}
    </span>
  )
}

export default function RecipesPage() {
  const { household } = useHousehold()
  const { recipes, loading, addRecipe, updateRecipe, deleteRecipe } = useRecipes(household?.id)
  const { items: pantryItems } = usePantry(household?.id)

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState(null)
  const [viewRecipe, setViewRecipe] = useState(null)

  // Paste import state
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importSourceUrl, setImportSourceUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  // Cookbook photo scan state
  const [showCookbook, setShowCookbook] = useState(false)
  const [cookbookFile, setCookbookFile] = useState(null)
  const [cookbookPreview, setCookbookPreview] = useState(null)
  const [cookbookBookTitle, setCookbookBookTitle] = useState('')
  const [cookbookPage, setCookbookPage] = useState('')
  const [scanningCookbook, setScanningCookbook] = useState(false)
  const [cookbookError, setCookbookError] = useState('')
  const cookbookFileRef = useRef()

  // Compute recently used ingredients sorted by frequency across all recipes
  const allIngredients = useMemo(() => {
    const freq = {}
    for (const recipe of recipes) {
      for (const ing of recipe.recipe_ingredients ?? []) {
        const key = ing.name.toLowerCase()
        if (!freq[key]) freq[key] = { name: ing.name, unit: ing.unit, count: 0 }
        freq[key].count++
      }
    }
    return Object.values(freq).sort((a, b) => b.count - a.count)
  }, [recipes])

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave(data) {
    if (editRecipe?.id) {
      await updateRecipe(editRecipe.id, data)
    } else {
      await addRecipe(data)
    }
    setShowForm(false)
    setEditRecipe(null)
  }

  async function handleDelete(id) {
    if (confirm('Delete this recipe?')) {
      await deleteRecipe(id)
      setViewRecipe(null)
    }
  }

  async function compressImage(file) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 2048
        const MAX_BYTES = 4 * 1024 * 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        let quality = 0.85
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.3) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(dataUrl.split(',')[1])
      }
      img.src = url
    })
  }

  function handleCookbookFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCookbookFile(file)
    setCookbookPreview(URL.createObjectURL(file))
  }

  async function handleCookbookScan(e) {
    e.preventDefault()
    if (!cookbookFile) return
    setScanningCookbook(true)
    setCookbookError('')

    const base64 = await compressImage(cookbookFile)
    const { data, error } = await supabase.functions.invoke('import-recipe', {
      body: { imageBase64: base64, mimeType: 'image/jpeg' },
    })

    setScanningCookbook(false)

    if (error || data?.error) {
      setCookbookError(data?.error ?? error?.message ?? 'Scan failed')
      return
    }

    const r = data.recipe
    const imported = {
      name: r.name ?? '',
      total_servings: r.total_servings ?? 4,
      instructions: r.instructions ?? '',
      notes: r.notes ?? '',
      rating: null,
      source_url: null,
      book_title: cookbookBookTitle.trim() || r.book_title || null,
      book_page: cookbookPage.trim() || r.book_page || null,
      recipe_ingredients: (r.ingredients ?? []).map(ing => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: 'other',
      })),
    }

    setShowCookbook(false)
    setCookbookFile(null)
    setCookbookPreview(null)
    setCookbookBookTitle('')
    setCookbookPage('')
    setEditRecipe(imported)
    setShowForm(true)
  }

  async function handleImport(e) {
    e.preventDefault()
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError('')

    const { data, error } = await supabase.functions.invoke('import-recipe', {
      body: { text: importUrl.trim(), source_url: importSourceUrl.trim() || null },
    })

    setImporting(false)

    if (error || data?.error) {
      setImportError(data?.error ?? error?.message ?? 'Import failed.')
      return
    }

    const r = data.recipe
    const imported = {
      name: r.name ?? '',
      total_servings: r.total_servings ?? 4,
      instructions: r.instructions ?? '',
      notes: r.notes ?? '',
      rating: null,
      source_url: r.source_url ?? importSourceUrl.trim() ?? null,
      recipe_ingredients: (r.ingredients ?? []).map(ing => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: 'other',
      })),
    }

    setShowImport(false)
    setImportUrl('')
    setImportSourceUrl('')
    setEditRecipe(imported)
    setShowForm(true)
  }

  if (viewRecipe) {
    const fresh = recipes.find(r => r.id === viewRecipe.id) ?? viewRecipe
    return (
      <RecipeDetail
        recipe={fresh}
        onEdit={() => { setEditRecipe(fresh); setViewRecipe(null); setShowForm(true) }}
        onDelete={() => handleDelete(fresh.id)}
        onBack={() => setViewRecipe(null)}
        onRate={async (rating) => { await updateRecipe(fresh.id, { rating }); setViewRecipe({ ...fresh, rating }) }}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Recipes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setCookbookError(''); setShowCookbook(true) }}
            className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            📷 Cookbook
          </button>
          <button
            onClick={() => { setImportError(''); setShowImport(true) }}
            className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            Import Recipe
          </button>
          <button
            onClick={() => { setEditRecipe(null); setShowForm(true) }}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
          >
            + Add Recipe
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search recipes..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-400"
      />

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📖</p>
          <p className="text-sm">No recipes yet</p>
          <div className="flex gap-3 justify-center mt-3">
            <button onClick={() => setShowForm(true)} className="text-green-600 text-sm hover:underline">
              Add manually
            </button>
            <span className="text-gray-300">·</span>
            <button onClick={() => setShowImport(true)} className="text-green-600 text-sm hover:underline">
              Import from URL
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => setViewRecipe(recipe)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-green-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 text-sm">{recipe.name}</p>
                    {recipe.source_url && (
                      <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-medium shrink-0">imported</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {recipe.recipe_ingredients?.length ?? 0} ingredients · {recipe.total_servings} servings
                  </p>
                </div>
                <div className="shrink-0">
                  <StarRating rating={recipe.rating} />
                </div>
              </div>
              {recipe.notes && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-1">{recipe.notes}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Recipe form */}
      {showForm && (
        <RecipeForm
          initial={editRecipe}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditRecipe(null) }}
          pantryItems={pantryItems}
          allIngredients={allIngredients}
        />
      )}

      {/* Cookbook scan modal */}
      {showCookbook && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-gray-800">Import from cookbook photo</h2>
              <button onClick={() => { setShowCookbook(false); setCookbookFile(null); setCookbookPreview(null); setCookbookBookTitle(''); setCookbookPage(''); setCookbookError('') }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Take a photo of a cookbook page or upload an image. The recipe will be extracted automatically.
            </p>
            <form onSubmit={handleCookbookScan} className="flex flex-col gap-3">
              {cookbookPreview ? (
                <div className="relative">
                  <img src={cookbookPreview} alt="Cookbook page" className="w-full max-h-56 object-contain rounded-xl border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => { setCookbookFile(null); setCookbookPreview(null); cookbookFileRef.current.value = '' }}
                    className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-8 cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                  <span className="text-3xl">📷</span>
                  <span className="text-sm text-gray-500">Tap to take photo or choose image</span>
                  <input
                    ref={cookbookFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCookbookFileChange}
                    className="hidden"
                  />
                </label>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Book title <span className="text-gray-400">(optional)</span></label>
                  <input
                    value={cookbookBookTitle}
                    onChange={e => setCookbookBookTitle(e.target.value)}
                    placeholder="e.g. Salt, Fat, Acid, Heat"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Page <span className="text-gray-400">(opt)</span></label>
                  <input
                    value={cookbookPage}
                    onChange={e => setCookbookPage(e.target.value)}
                    placeholder="42"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>
              {cookbookError && (
                <p className="text-xs text-red-500">{cookbookError}</p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowCookbook(false); setCookbookFile(null); setCookbookPreview(null); setCookbookBookTitle(''); setCookbookPage(''); setCookbookError('') }}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={scanningCookbook || !cookbookFile}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {scanningCookbook ? 'Scanning...' : 'Scan Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-gray-800">Import recipe from text</h2>
              <button onClick={() => { setShowImport(false); setImportUrl(''); setImportSourceUrl(''); setImportError('') }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Open the recipe in your browser, select all the text, copy it, and paste it below.
            </p>
            <form onSubmit={handleImport} className="flex flex-col gap-3">
              <textarea
                autoFocus
                required
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                placeholder="Paste recipe text here — ingredients, instructions, everything..."
                rows={10}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
              <input
                type="url"
                value={importSourceUrl}
                onChange={e => setImportSourceUrl(e.target.value)}
                placeholder="Source URL (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              {importError && (
                <p className="text-xs text-red-500">{importError}</p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowImport(false); setImportUrl(''); setImportSourceUrl(''); setImportError('') }}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={importing || !importUrl.trim()}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
