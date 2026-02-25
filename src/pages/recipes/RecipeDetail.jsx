const UNITS = ['count', 'lbs', 'oz', 'g', 'kg', 'cups', 'liters', 'ml', 'gallons', 'dozen', 'bunch', 'bag', 'box', 'can', 'bottle', 'jar', 'tsp', 'tbsp', 'pinch']

export default function RecipeDetail({ recipe, onEdit, onDelete, onBack, onRate }) {
  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
        ← Back to recipes
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-800">{recipe.name}</h1>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="text-xs text-blue-500 hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-lg"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 border border-red-200 rounded-lg"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Meta */}
        <p className="text-sm text-gray-500 mb-4">
          {recipe.total_servings} serving{recipe.total_servings !== 1 ? 's' : ''}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-gray-500">Rating:</span>
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => onRate(star === recipe.rating ? null : star)}
              className={`text-xl leading-none ${star <= (recipe.rating ?? 0) ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}
            >
              ★
            </button>
          ))}
        </div>

        {/* Ingredients */}
        {recipe.recipe_ingredients?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Ingredients</h2>
            <ul className="flex flex-col gap-1">
              {recipe.recipe_ingredients.map(ing => (
                <li key={ing.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="font-medium">{ing.quantity} {ing.unit}</span>
                  <span>{ing.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Instructions */}
        {recipe.instructions && (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Instructions</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{recipe.instructions}</p>
          </div>
        )}

        {/* Notes */}
        {recipe.notes && (
          <div className="mt-4 bg-yellow-50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-yellow-700 mb-1">Notes</h2>
            <p className="text-sm text-yellow-800 whitespace-pre-wrap">{recipe.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
