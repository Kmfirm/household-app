import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/pantry', label: 'Pantry', icon: '🥫' },
  { to: '/recipes', label: 'Recipes', icon: '📖' },
  { to: '/calendar', label: 'Meal Plan', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
]

const secondaryNav = [
  { to: '/leftovers', label: 'Leftovers', icon: '🍱' },
  { to: '/nutrition', label: 'Nutrition', icon: '💪' },
  { to: '/receipts', label: 'Receipts', icon: '🧾' },
]

const phase3Nav = [
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/suggestions', label: 'Suggestions', icon: '✨' },
]

export default function Layout() {
  const { signOut } = useAuth()

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

      {/* Bottom nav (mobile — primary pages) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 md:hidden z-40">
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center text-xs gap-0.5 px-2 py-1 rounded ${isActive ? 'text-green-600 font-medium' : 'text-gray-500'}`
            }>
            <span className="text-lg">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sidebar (desktop) */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-52 bg-white border-r border-gray-200 flex-col pt-16 px-3 gap-1 z-40 overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1 mt-2">Main</p>
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
            }>
            <span>{icon}</span>{label}
          </NavLink>
        ))}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1 mt-4">More</p>
        {secondaryNav.map(({ to, label, icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`
            }>
            <span>{icon}</span>{label}
          </NavLink>
        ))}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1 mt-4">Insights</p>
        {phase3Nav.map(({ to, label, icon }) => (
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
