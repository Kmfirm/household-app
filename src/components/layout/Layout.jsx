import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ALL_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/pantry', label: 'Pantry', icon: '🥫' },
  { to: '/recipes', label: 'Recipes', icon: '📖' },
  { to: '/calendar', label: 'Meal Plan', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/leftovers', label: 'Leftovers', icon: '🍱' },
  { to: '/nutrition', label: 'Nutrition', icon: '💪' },
  { to: '/receipts', label: 'Receipts', icon: '🧾' },
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/suggestions', label: 'Suggestions', icon: '✨' },
]

function loadNavOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('navOrder') ?? 'null')
    if (!Array.isArray(saved)) return ALL_NAV_ITEMS
    const itemMap = Object.fromEntries(ALL_NAV_ITEMS.map(i => [i.to, i]))
    const ordered = saved.map(to => itemMap[to]).filter(Boolean)
    // Add any new items not in saved order
    const missing = ALL_NAV_ITEMS.filter(i => !saved.includes(i.to))
    return [...ordered, ...missing]
  } catch {
    return ALL_NAV_ITEMS
  }
}

export default function Layout() {
  const { signOut } = useAuth()
  const [navOrder, setNavOrder] = useState(loadNavOrder)
  const [showReorder, setShowReorder] = useState(false)

  function moveItem(index, direction) {
    const next = [...navOrder]
    const swap = index + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setNavOrder(next)
    localStorage.setItem('navOrder', JSON.stringify(next.map(i => i.to)))
  }

  const desktopMain = navOrder.slice(0, 5)
  const desktopMore = navOrder.slice(5)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between md:pl-56">
        <span className="font-semibold text-gray-800">Household App</span>
        <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">
          Sign out
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 p-4 pb-24 md:pl-56">
        <Outlet />
      </main>

      {/* Bottom nav (mobile — scrollable) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40">
        <div className="flex items-stretch">
          {/* Scrollable items */}
          <div className="relative flex-1 min-w-0">
            <div className="flex overflow-x-auto scrollbar-hide py-2 px-2 gap-1">
              {navOrder.map(({ to, label, icon }) => (
                <NavLink key={to} to={to} end={to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center text-xs gap-0.5 px-3 py-1 rounded shrink-0 ${isActive ? 'text-green-600 font-medium' : 'text-gray-500'}`
                  }>
                  <span className="text-lg">{icon}</span>
                  {label}
                </NavLink>
              ))}
            </div>
            {/* Scroll fade indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent pointer-events-none" />
          </div>

          {/* Reorder button */}
          <button
            onClick={() => setShowReorder(true)}
            className="shrink-0 flex flex-col items-center justify-center text-xs text-gray-400 px-3 border-l border-gray-100 gap-0.5"
          >
            <span className="text-lg">⋮⋮</span>
            Edit
          </button>
        </div>
      </nav>

      {/* Reorder modal */}
      {showReorder && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReorder(false)} />
          <div className="relative bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Reorder Navigation</h2>
              <button onClick={() => setShowReorder(false)} className="text-gray-400 text-sm">Done</button>
            </div>
            <div className="flex flex-col gap-2">
              {navOrder.map(({ to, label, icon }, index) => (
                <div key={to} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-lg">{icon}</span>
                  <span className="flex-1 text-sm text-gray-700">{label}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 disabled:opacity-30"
                    >↑</button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === navOrder.length - 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 disabled:opacity-30"
                    >↓</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar (desktop) */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-52 bg-white border-r border-gray-200 flex-col pt-16 px-3 gap-1 z-40 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1 mt-2">Main</p>
        {desktopMain.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
            }>
            <span>{icon}</span>{label}
          </NavLink>
        ))}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1 mt-4">More</p>
        {desktopMore.map(({ to, label, icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
            }>
            <span>{icon}</span>{label}
          </NavLink>
        ))}
        <button onClick={signOut} className="mt-auto mb-4 text-sm text-gray-400 hover:text-gray-600 px-3 py-2 text-left">
          Sign out
        </button>
      </nav>
    </div>
  )
}
