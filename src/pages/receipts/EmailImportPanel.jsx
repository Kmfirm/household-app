import { useState } from 'react'
import { useEmailImport } from '../../hooks/useEmailImport'

const STATUS_STYLES = {
  imported: 'bg-green-50 text-green-700',
  processing: 'bg-gray-100 text-gray-600',
  skipped: 'bg-yellow-50 text-yellow-700',
  gmail_verification: 'bg-blue-50 text-blue-700',
  error: 'bg-red-50 text-red-700',
}

const STATUS_LABELS = {
  imported: 'Imported',
  processing: 'Processing',
  skipped: 'Skipped',
  gmail_verification: 'Gmail confirmation',
  error: 'Error',
}

export default function EmailImportPanel({ householdId, userId, onImported }) {
  const { configured, address, inboundEmails, loading, fetchAll, createAddress, resetAddress } =
    useEmailImport(householdId, userId)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRefresh() {
    await fetchAll()
    onImported?.()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-medium text-gray-800">Auto-import from email</span>
        <span className="text-xs text-gray-400">{address ? 'On' : 'Off'} {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-3">
          {!configured && (
            <p className="text-xs text-red-600">
              Email import isn't configured yet — set VITE_INBOUND_EMAIL_ADDRESS and redeploy.
            </p>
          )}

          {configured && !address && !loading && (
            <>
              <p className="text-xs text-gray-600">
                Get a private address for this household. Digital receipts forwarded to it are added to your pantry automatically.
              </p>
              <button
                onClick={createAddress}
                className="bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700"
              >
                Create import address
              </button>
            </>
          )}

          {address && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Your import address</label>
                <div className="flex gap-2">
                  <code className="flex-1 min-w-0 truncate text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-2">
                    {address}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-green-600 font-medium px-3 border border-green-200 rounded-lg hover:text-green-800"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <ol className="text-xs text-gray-600 list-decimal pl-4 flex flex-col gap-1">
                <li>In Gmail, go to Settings → Forwarding and POP/IMAP → Add a forwarding address, and paste the address above.</li>
                <li>Gmail sends a confirmation code here. Tap Refresh below, open the "Gmail confirmation" entry, and enter the code in Gmail.</li>
                <li>Create a filter: From contains <code>shoprite</code> → Forward it to your import address.</li>
              </ol>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Recent emails</span>
                <button onClick={handleRefresh} className="text-xs text-green-600 hover:text-green-800 font-medium">
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {inboundEmails.length === 0 && (
                <p className="text-xs text-gray-400">Nothing received yet.</p>
              )}

              <div className="flex flex-col gap-2">
                {inboundEmails.map(e => (
                  <div key={e.id} className="border border-gray-100 rounded-lg p-2">
                    <button
                      onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                      className="w-full flex items-center gap-2 text-left"
                    >
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_STYLES[e.status]}`}>
                        {STATUS_LABELS[e.status]}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-xs text-gray-700">{e.subject || '(no subject)'}</span>
                      <span className="text-[10px] text-gray-400">{new Date(e.created_at).toLocaleDateString()}</span>
                    </button>
                    {expandedId === e.id && (
                      <div className="mt-2 flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">From: {e.from_address}</p>
                        {e.error && <p className="text-[11px] text-red-600">{e.error}</p>}
                        {e.body_preview && (
                          <pre className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-48 overflow-y-auto">
                            {e.body_preview}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!confirmReset ? (
                <button onClick={() => setConfirmReset(true)} className="text-xs text-gray-400 hover:text-gray-600 self-start">
                  Reset address
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">The old address will stop working. Continue?</span>
                  <button
                    onClick={async () => { await resetAddress(); setConfirmReset(false) }}
                    className="text-red-500 font-medium"
                  >
                    Reset
                  </button>
                  <button onClick={() => setConfirmReset(false)} className="text-gray-500">Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
