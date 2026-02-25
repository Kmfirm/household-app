import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Pantry Items', value: '—', icon: '🥫' },
          { label: 'Expiring Soon', value: '—', icon: '⚠️' },
          { label: 'This Week', value: '—', icon: '📅' },
          { label: 'Shopping List', value: '—', icon: '🛒' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-gray-800">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
