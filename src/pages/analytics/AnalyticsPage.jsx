import { useState } from 'react'
import { useHousehold } from '../../hooks/useHousehold'
import { useAnalytics } from '../../hooks/useAnalytics'

function SpendingBar({ week, total, maxTotal }) {
  const pct = maxTotal ? Math.round((total / maxTotal) * 100) : 0
  const label = new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-400 rounded-full flex items-center justify-end pr-2 transition-all"
          style={{ width: `${Math.max(pct, 4)}%` }}
        >
          {pct > 20 && <span className="text-xs text-white font-medium">${total}</span>}
        </div>
      </div>
      {pct <= 20 && <span className="text-xs text-gray-600 font-medium w-12">${total}</span>}
    </div>
  )
}

export default function AnalyticsPage() {
  const { household } = useHousehold()
  const { spending, storeBreakdown, priceHistory, loading, totalSpent, avgWeekly, priceComparison } = useAnalytics(household?.id)

  const [priceQuery, setPriceQuery] = useState('')
  const [priceResults, setPriceResults] = useState([])

  const maxWeekly = spending.length ? Math.max(...spending.map(s => s.total)) : 0

  function handlePriceSearch(e) {
    e.preventDefault()
    if (!priceQuery.trim()) return
    setPriceResults(priceComparison(priceQuery.trim()))
  }

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading analytics...</div>
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Analytics</h1>
      <p className="text-sm text-gray-400 mb-4">Spending trends and price tracking</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-600">${totalSpent.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Total (last 8 wks)</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">${avgWeekly.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Avg per week</p>
        </div>
      </div>

      {/* Weekly spending chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Weekly spending</h2>
        {spending.length === 0 ? (
          <p className="text-xs text-gray-400">No spending data yet. Add receipts or pantry items with prices.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {spending.map(s => (
              <SpendingBar key={s.week} week={s.week} total={s.total} maxTotal={maxWeekly} />
            ))}
          </div>
        )}
      </div>

      {/* Store breakdown */}
      {storeBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Spending by store</h2>
          <div className="flex flex-col gap-2">
            {storeBreakdown.map(({ store, total }) => {
              const pct = totalSpent ? Math.round((total / totalSpent) * 100) : 0
              return (
                <div key={store} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gray-700 font-medium w-32 truncate">{store}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-gray-600 ml-3 text-xs font-medium">${total} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Price comparison */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Price comparison</h2>
        <form onSubmit={handlePriceSearch} className="flex gap-2 mb-3">
          <input
            value={priceQuery}
            onChange={e => setPriceQuery(e.target.value)}
            placeholder="Search item (e.g. milk, eggs)..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            Search
          </button>
        </form>

        {priceResults.length > 0 && (
          <div className="flex flex-col gap-2">
            {priceResults
              .sort((a, b) => a.price - b.price)
              .map((r, i) => (
                <div key={r.store} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${i === 0 ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                  <div>
                    <span className="font-medium text-gray-800">{r.store}</span>
                    {r.unit && <span className="text-xs text-gray-400 ml-1">per {r.unit}</span>}
                    {i === 0 && <span className="ml-2 text-xs text-green-600 font-medium">Best price</span>}
                  </div>
                  <span className="font-bold text-gray-700">${Number(r.price).toFixed(2)}</span>
                </div>
              ))}
          </div>
        )}

        {priceResults.length === 0 && priceHistory.length === 0 && (
          <p className="text-xs text-gray-400">Price history is populated automatically from scanned receipts.</p>
        )}

        {priceResults.length === 0 && priceHistory.length > 0 && priceQuery && (
          <p className="text-xs text-gray-400">No price history found for "{priceQuery}".</p>
        )}
      </div>
    </div>
  )
}
