import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const ACTION_ICONS = {
  create_recipe: '📖',
  add_meal: '➕',
  move_meal: '↔️',
  update_meal: '✏️',
  remove_meal: '🗑️',
}

// What the model sees for its own earlier turns: the reply plus what it proposed and whether it was applied
function turnText(m) {
  if (m.role !== 'assistant' || !m.actions?.length) return m.content
  const status = m.appliedResult ? 'The user applied these changes.' : 'Not applied yet.'
  return `${m.content}\n\nProposed changes:\n${m.actions.map(a => `- ${a.summary}`).join('\n')}\n(${status})`
}

// Chat with the meal-plan AI. getContext() returns the planner state to send with each message;
// onApply(actions) applies the confirmed changes and returns { applied, errors, pantry }.
export default function AiChat({ mode, getContext, onApply, placeholder, intro, examples = [] }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [applyingIdx, setApplyingIdx] = useState(null)
  const [selected, setSelected] = useState({}) // message index -> Set of action indexes
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, sending])

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || sending) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('meal-plan-ai', {
        body: {
          mode,
          context: getContext(),
          messages: next.map(m => ({ role: m.role, content: turnText(m) })),
        },
      })
      if (error) {
        // Non-2xx responses carry our { error } message in the response body
        let msg = error.message
        try { const body = await error.context?.json(); if (body?.error) msg = body.error } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      const actions = data.actions ?? []
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, actions }])
      setSelected(prev => ({ ...prev, [next.length]: new Set(actions.map((_, i) => i)) }))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${err.message}`, error: true }])
    } finally {
      setSending(false)
    }
  }

  function toggleAction(msgIdx, actionIdx) {
    setSelected(prev => {
      const set = new Set(prev[msgIdx] ?? [])
      if (set.has(actionIdx)) set.delete(actionIdx)
      else set.add(actionIdx)
      return { ...prev, [msgIdx]: set }
    })
  }

  async function apply(msgIdx) {
    const msg = messages[msgIdx]
    const chosen = msg.actions.filter((_, i) => selected[msgIdx]?.has(i))
    if (!chosen.length) return
    setApplyingIdx(msgIdx)
    const result = await onApply(chosen)
    setApplyingIdx(null)
    setMessages(prev => prev.map((m, i) => (i === msgIdx ? { ...m, appliedResult: result } : m)))
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2 min-h-[12rem]">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500">
            <p>{intro}</p>
            {examples.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3">
                {examples.map(ex => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="text-left text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-lg px-3 py-2 hover:bg-purple-100"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[95%] w-full'}>
            {m.role === 'user' ? (
              <div className="bg-green-600 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div className={`text-sm rounded-2xl rounded-bl-sm px-3 py-2 ${m.error ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-800'}`}>
                <p className="whitespace-pre-wrap">{m.content}</p>

                {m.actions?.length > 0 && (
                  <div className="mt-2 bg-white rounded-xl border border-gray-200 p-2">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Proposed changes</p>
                    <div className="flex flex-col gap-1">
                      {m.actions.map((a, ai) => (
                        <label key={ai} className="flex items-start gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-green-600"
                            disabled={!!m.appliedResult}
                            checked={selected[idx]?.has(ai) ?? false}
                            onChange={() => toggleAction(idx, ai)}
                          />
                          <span>
                            {ACTION_ICONS[a.type]} {a.summary}
                            {a.type === 'create_recipe' && a.ingredients?.length > 0 && (
                              <span className="block text-gray-400">
                                {a.ingredients.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>

                    {m.appliedResult ? (
                      <div className="mt-2 text-xs">
                        <p className="text-green-700 font-medium">
                          ✓ Applied {m.appliedResult.applied} change{m.appliedResult.applied !== 1 ? 's' : ''}
                          {m.appliedResult.pantry?.deducted ? ` · updated ${m.appliedResult.pantry.deducted} pantry item${m.appliedResult.pantry.deducted !== 1 ? 's' : ''}` : ''}
                        </p>
                        {m.appliedResult.pantry?.skipped?.length > 0 && (
                          <p className="text-gray-500">Not deducted from pantry: {m.appliedResult.pantry.skipped.join(', ')}</p>
                        )}
                        {m.appliedResult.errors.map(e => <p key={e} className="text-red-600">✕ {e}</p>)}
                      </div>
                    ) : (
                      <button
                        onClick={() => apply(idx)}
                        disabled={applyingIdx !== null || !selected[idx]?.size}
                        className="mt-2 w-full bg-green-600 text-white text-xs font-medium rounded-lg py-1.5 hover:bg-green-700 disabled:opacity-40"
                      >
                        {applyingIdx === idx ? 'Applying…' : `Apply ${selected[idx]?.size ?? 0} change${selected[idx]?.size === 1 ? '' : 's'}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="self-start bg-gray-100 text-gray-500 text-sm rounded-2xl rounded-bl-sm px-3 py-2">
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex gap-2 pt-2 border-t border-gray-100"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          placeholder={placeholder}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-purple-600 text-white text-sm font-medium rounded-lg px-4 hover:bg-purple-700 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
