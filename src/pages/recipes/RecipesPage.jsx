import { useState } from 'react'
import { useRecipes } from '../../hooks/useRecipes'
import { useHousehold } from '../../hooks/useHousehold'
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
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState(null)
  const [viewRecipe, setViewRecipe] = useState(null)

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave(data) {
    if (editRecipe) {
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
        <button
          onClick={() => { setEditRecipe(null); setShowForm(true) }}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
        >
          + Add Recipe
        </button>
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
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-green-600 text-sm hover:underline"
          >
            Add your first recipe
          </button>
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
                  <p className="font-medium text-gray-800 text-sm">{recipe.name}</p>
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

      {showForm && (
        <RecipeForm
          initial={editRecipe}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditRecipe(null) }}
        />
      )}
    </div>
  )
}
