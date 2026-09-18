import { useCallback, useEffect, useRef, useState } from 'react'
import { StreamMD } from 'stream-md'
import type { ChatEntry } from './chat-entries'
import { applyChatEvent, freshEntries, userEntry } from './chat-entries'

interface ChatProps {
  authStatus: 'signed-in' | 'signing-in' | 'signed-out'
  modelConnected: boolean
  sessionId: string | null
  /** Messages injected from the shell (guided create-site flow). */
  outgoing: { text: string; nonce: number } | null
}

function hintForEmpty(authStatus: ChatProps['authStatus'], modelConnected: boolean): string {
  if (authStatus !== 'signed-in') return 'Sign in first — the agent talks to PageWeave on your behalf.'
  if (!modelConnected) return 'Connect a model to start — open “Connect” above.'
  return 'Pick a site in the sidebar, or create a new one — then ask the agent to build something.'
}

export default function Chat({ authStatus, modelConnected, sessionId, outgoing }: ChatProps): React.JSX.Element {
  const [entries, setEntries] = useState<ChatEntry[]>(() => freshEntries())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastOutgoingNonce = useRef(0)

  useEffect(() => {
    const unsubscribe = window.pw.engine.onEvent((event) => {
      switch (event.type) {
        case 'agent_start':
          setBusy(true)
          break
        case 'agent_end':
          setBusy(false)
          break
        case 'error':
          setBusy(false)
          break
        case 'session':
          setBusy(false)
          setPromptError(null)
          break
        default:
          break
      }
      setEntries((prev) => applyChatEvent(prev, event))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries])

  const sendText = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      setPromptError(null)
      setEntries((prev) => [...prev, userEntry(trimmed)])
      try {
        await window.pw.engine.prompt({ text: trimmed })
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : String(err))
      }
    },
    [busy],
  )

  const send = useCallback(async (): Promise<void> => {
    const text = input
    setInput('')
    await sendText(text)
  }, [input, sendText])

  /* Messages injected from the shell (guided create-site flow). */
  useEffect(() => {
    if (!outgoing || outgoing.nonce === lastOutgoingNonce.current) return
    lastOutgoingNonce.current = outgoing.nonce
    void sendText(outgoing.text)
  }, [outgoing, sendText])

  const abort = useCallback(async (): Promise<void> => {
    try {
      await window.pw.engine.abort()
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const agentReady = authStatus === 'signed-in' && modelConnected && sessionId !== null

  return (
    <div className="flex h-full flex-col">
      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {entries.length === 0 && (
          <div className="py-8 text-center text-sm opacity-50">{hintForEmpty(authStatus, modelConnected)}</div>
        )}
        {entries.map((entry) => (
          <ChatRow key={entry.id} entry={entry} />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-base-300 p-3">
        {promptError && <div className="mb-2 text-error text-xs">{promptError}</div>}
        <div className="flex gap-2">
          <textarea
            className="textarea textarea-bordered flex-1 text-sm"
            rows={2}
            placeholder={agentReady ? 'Ask the agent to build something…' : hintForEmpty(authStatus, modelConnected)}
            value={input}
            disabled={!agentReady || busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          {busy ? (
            <button type="button" className="btn btn-error btn-sm self-end" onClick={() => void abort()}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm self-end"
              disabled={!agentReady || !input.trim()}
              onClick={() => void send()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatRow({ entry }: { entry: ChatEntry }): React.JSX.Element {
  if (entry.kind === 'user') {
    return (
      <div className="chat chat-end">
        <div className="chat-bubble chat-bubble-primary max-w-full whitespace-pre-wrap text-sm">{entry.text}</div>
      </div>
    )
  }
  if (entry.kind === 'assistant') {
    return (
      <div className="chat chat-start">
        <div className="chat-bubble max-w-full bg-base-200 text-sm">
          <StreamMD text={entry.text} className="stream-md-chat" />
          {entry.streaming && <span className="loading loading-dots loading-xs ml-1 align-middle" />}
        </div>
      </div>
    )
  }
  if (entry.kind === 'thinking') {
    return (
      <details className="collapse collapse-arrow bg-base-200 text-xs">
        <summary className="collapse-title min-h-8 py-1 text-xs opacity-60">Thinking…</summary>
        <div className="collapse-content">
          <div className="whitespace-pre-wrap opacity-70">{entry.text}</div>
        </div>
      </details>
    )
  }
  if (entry.kind === 'tool') {
    const running = entry.tool.status === 'running'
    const confirmUrl = entry.tool.confirmUrl
    return (
      <details className="collapse collapse-arrow bg-base-200 text-xs" open={running}>
        <summary className="collapse-title min-h-8 py-1">
          <span className={running ? 'text-info' : entry.tool.status === 'failed' ? 'text-error' : 'text-success'}>
            {running ? '⟳' : entry.tool.status === 'failed' ? '✗' : '✓'}
          </span>{' '}
          <span className="text-xs">{entry.tool.name}</span>
        </summary>
        <div className="collapse-content">
          {confirmUrl && (
            <div className="mb-2 flex items-center gap-2">
              <span>This change needs your confirmation.</span>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => void window.pw.app.openExternal(confirmUrl)}
              >
                Review & confirm ↗
              </button>
            </div>
          )}
          {entry.tool.outputPreview && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs opacity-80">
              {entry.tool.outputPreview}
            </pre>
          )}
        </div>
      </details>
    )
  }
  if (entry.kind === 'status') {
    return <div className="text-center text-xs opacity-50">{entry.text}</div>
  }
  return (
    <div className="alert alert-error py-2 text-xs">
      <span>{entry.text}</span>
    </div>
  )
}
