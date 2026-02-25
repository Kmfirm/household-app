import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../hooks/useHousehold'
import { usePantry } from '../hooks/usePantry'

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
    { label: 'Pantry Items', value: items.length, icon: '🥫' },
    { label: 'Expiring This Week', value: expiringSoon.length, icon: '⚠️' },
    { label: 'Expired', value: expired.length, icon: '🗑️' },
    { label: 'Household', value: household?.name ?? '—', icon: '🏡', small: true },
  ]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ label, value, icon, small }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl mb-1">{icon}</div>
            <div className={`font-bold text-gray-800 ${small ? 'text-base' : 'text-2xl'}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Invite code */}
      {household?.invite_code && (
        <div className="mt-6 bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium mb-1">Household invite code</p>
          <p className="text-2xl font-bold tracking-widest text-green-800">{household.invite_code}</p>
          <p className="text-xs text-green-600 mt-1">Share this code so your household members can join.</p>
        </div>
      )}
    </div>
  )
}
