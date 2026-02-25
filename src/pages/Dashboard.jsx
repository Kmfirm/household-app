import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../hooks/useHousehold'
import { usePantry } from '../hooks/usePantry'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const { items } = usePantry(household?.id)

  const expiringSoon = items.filter(item => {
    if (!item.expiration_date) return false
    const days = Math.ceil((new Date(item.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  })

  const expired = items.filter(item => {
    if (!item.expiration_date) return false
    return new Date(item.expiration_date) < new Date()
  })

  const stats = [
    { label: 'Pantry Items', value: items.length, icon: '🥫', to: '/pantry' },
    { label: 'Expiring Soon', value: expiringSoon.length, icon: '⚠️', to: '/pantry' },
    { label: 'Expired', value: expired.length, icon: '🗑️', to: '/pantry' },
    { label: 'Household', value: household?.name ?? '—', icon: '🏡', small: true },
  ]

  const quickLinks = [
    { to: '/suggestions', label: 'What can I make?', icon: '✨', desc: 'Recipes from your pantry' },
    { to: '/analytics', label: 'Spending', icon: '📊', desc: 'Weekly trends & store prices' },
    { to: '/shopping', label: 'Shopping list', icon: '🛒', desc: 'Check off items as you shop' },
    { to: '/nutrition', label: 'Nutrition', icon: '💪', desc: 'Log today\'s meals' },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-500 mb-4">{user?.email}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        {stats.map(({ label, value, icon, small, to }) => (
          to ? (
            <Link key={label} to={to} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-green-200 transition-colors block">
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`font-bold text-gray-800 ${small ? 'text-base' : 'text-2xl'}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </Link>
          ) : (
            <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`font-bold text-gray-800 ${small ? 'text-base' : 'text-2xl'}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          )
        ))}
      </div>

      {/* Quick links */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick access</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {quickLinks.map(({ to, label, icon, desc }) => (
          <Link key={to} to={to}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-green-200 transition-colors flex items-start gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Expiring alert */}
      {expiringSoon.length > 0 && (
        <Link to="/suggestions" className="block bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4 hover:border-orange-200 transition-colors">
          <p className="text-sm font-semibold text-orange-700 mb-1">
            {expiringSoon.length} item{expiringSoon.length !== 1 ? 's' : ''} expiring this week
          </p>
          <p className="text-xs text-orange-600">Tap to see recipe suggestions that use them up.</p>
        </Link>
      )}

      {/* Invite code */}
      {household?.invite_code && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium mb-1">Household invite code</p>
          <p className="text-2xl font-bold tracking-widest text-green-800">{household.invite_code}</p>
          <p className="text-xs text-green-600 mt-1">Share this code so your household members can join.</p>
        </div>
      )}
    </div>
  )
}
