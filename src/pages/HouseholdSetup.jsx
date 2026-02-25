import { useState } from 'react'
import { useHousehold } from '../hooks/useHousehold'

export default function HouseholdSetup() {
  const { createHousehold, joinHousehold } = useHousehold()
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = mode === 'create'
      ? await createHousehold(value)
      : await joinHousehold(value)
    if (result.error) {
      setError(result.error.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Set up your household</h1>
        <p className="text-sm text-gray-500 mb-6">
          Create a new household or join an existing one with an invite code.
        </p>

        {!mode && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('create')}
              className="bg-green-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-700"
            >
              Create a new household
            </button>
            <button
              onClick={() => setMode('join')}
              className="border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-medium hover:bg-gray-50"
            >
              Join with an invite code
            </button>
          </div>
        )}

        {mode && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={mode === 'create' ? 'Household name (e.g. The Kwartlers)' : 'Enter invite code'}
              required
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 uppercase-placeholder"
              style={mode === 'join' ? { textTransform: 'uppercase', letterSpacing: '0.1em' } : {}}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'create' ? 'Create household' : 'Join household'}
            </button>
            <button
              type="button"
              onClick={() => { setMode(null); setValue(''); setError('') }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
