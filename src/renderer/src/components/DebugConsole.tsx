import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineEvent } from '../../../shared/engine-events'
import { MODEL_PROVIDERS, type AuthState, type ModelConfigView, type ModelProvider } from '../../../shared/ipc'

interface Entry {
  id: number
  kind: 'user' | 'assistant' | 'thinking' | 'tool' | 'status' | 'error'
  text: string
  toolName?: string
  running?: boolean
  failed?: boolean
}

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter (recommended)',
  custom: 'Custom (OpenAI-compatible)',
}

let entrySeq = 0
function nextEntryId(): number {
  entrySeq += 1
  return entrySeq
}

export default function DebugConsole({ auth }: { auth: AuthState }): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [modelConfig, setModelConfig] = useState<ModelConfigView>(null)
  const [showModelForm, setShowModelForm] = useState(false)
  const [provider, setProvider] = useState<ModelProvider>('openrouter')
  const [modelId, setModelId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelOptions, setModelOptions] = useState<{ id: string; name: string }[]>([])
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const pushEntry = useCallback((entry: Omit<Entry, 'id'>) => {
    setEntries((prev) => [...prev, { ...entry, id: nextEntryId() }])
  }, [])

  useEffect(() => {
    void window.pw.models.getState().then((config) => {
      setModelConfig(config)
      if (!config) setShowModelForm(true)
    })
    const unsubscribeModel = window.pw.models.onChanged(setModelConfig)
    const unsubscribeEvents = window.pw.engine.onEvent((event: EngineEvent) => {
      switch (event.type) {
        case 'session':
          setSessionId(event.sessionId)
          break
        case 'agent_start':
          setBusy(true)
          break
        case 'agent_end':
          setBusy(false)
          break
        case 'text_delta':
          setEntries((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.kind === 'assistant') {
              return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }]
            }
            return [...prev, { id: nextEntryId(), kind: 'assistant', text: event.delta }]
          })
          break
        case 'thinking_delta':
          setEntries((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.kind === 'thinking') {
              return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }]
            }
            return [...prev, { id: nextEntryId(), kind: 'thinking', text: event.delta }]
          })
          break
        case 'tool_start':
          pushEntry({ kind: 'tool', text: '', toolName: event.name, running: true })
          break
        case 'tool_end':
          setEntries((prev) => {
            const index = [...prev].reverse().findIndex((e) => e.kind === 'tool' && e.toolName === event.name && e.running)
            if (index === -1) return prev
            const realIndex = prev.length - 1 - index
            const target = prev[realIndex]
            if (!target) return prev
            const updated: Entry = { ...target, running: false, failed: event.isError }
            if (event.outputPreview) updated.text = event.outputPreview
            return [...prev.slice(0, realIndex), updated, ...prev.slice(realIndex + 1)]
          })
          break
        case 'status':
          pushEntry({ kind: 'status', text: event.message })
          break
        case 'error':
          setBusy(false)
          pushEntry({ kind: 'error', text: event.message })
          break
      }
    })
    return () => {
      unsubscribeModel()
      unsubscribeEvents()
    }
  }, [pushEntry])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setPromptError(null)
    pushEntry({ kind: 'user', text })
    setInput('')
    try {
      await window.pw.engine.prompt({ text })
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : String(err))
    }
  }, [input, busy, pushEntry])

  const abort = useCallback(async () => {
    try {
      await window.pw.engine.abort()
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const saveModel = useCallback(
    async (patch: { provider: ModelProvider; modelId?: string; baseUrl?: string; apiKey?: string }) => {
      setModelBusy(true)
      setModelError(null)
      try {
        const config = await window.pw.models.save(patch)
        setModelConfig(config)
        if (config?.modelId) {
          setShowModelForm(false)
          setApiKey('')
        }
      } catch (err) {
        setModelError(err instanceof Error ? err.message : String(err))
      } finally {
        setModelBusy(false)
      }
    },
    [],
  )

  const fetchModels = useCallback(async () => {
    setModelBusy(true)
    setModelError(null)
    try {
      await window.pw.models.save({ provider, ...(apiKey ? { apiKey } : {}) })
      const { models } = await window.pw.models.list(provider)
      setModelOptions(models.map((m) => ({ id: m.id, name: m.name })))
      if (models.length === 0) setModelError('No models available for this key.')
    } catch (err) {
      setModelError(err instanceof Error ? err.message : String(err))
    } finally {
      setModelBusy(false)
    }
  }, [provider, apiKey])

  const disconnectModel = useCallback(async () => {
    setModelBusy(true)
    try {
      const config = await window.pw.models.clear()
      setModelConfig(config)
      setModelId('')
      setBaseUrl('')
      setApiKey('')
      setModelOptions([])
      setShowModelForm(true)
    } finally {
      setModelBusy(false)
    }
  }, [])

  const modelConnected = modelConfig !== null && modelConfig.modelId !== undefined
  const agentReady = auth.status === 'signed-in' && modelConnected && sessionId !== null

  return (
    <div className="flex h-full flex-col">
      {/* Debug toolbar */}
      <div className="flex items-center gap-2 border-b border-base-300 px-3 py-1.5 text-xs">
        <span className="font-semibold uppercase opacity-60">Debug console</span>
        <span className="badge badge-ghost badge-sm">{modelConnected ? modelConfig.provider : 'no model'}</span>
        {sessionId && <span className="badge badge-ghost badge-sm">session {sessionId.slice(0, 8)}</span>}
        <div className="ml-auto flex gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowModelForm((v) => !v)}>
            Model…
          </button>
          {modelConnected && (
            <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => void disconnectModel()}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Model connect form */}
      {showModelForm && (
        <div className="border-b border-base-300 bg-base-200 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="form-control">
              <span className="label-text pb-1 text-xs">Provider</span>
              <select
                className="select select-bordered select-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ModelProvider)}
              >
                {MODEL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text pb-1 text-xs">API key</span>
              <input
                type="password"
                className="input input-bordered input-sm"
                placeholder={modelConfig?.provider === provider ? '•••• (saved)' : 'Paste API key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            {provider === 'custom' && (
              <label className="form-control col-span-1">
                <span className="label-text pb-1 text-xs">Base URL</span>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder="https://api.example.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </label>
            )}
            <label className="form-control col-span-1">
              <span className="label-text pb-1 text-xs">Model</span>
              <input
                type="text"
                className="input input-bordered input-sm"
                placeholder={provider === 'custom' ? 'model id' : 'pick or type a model id'}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                list="pw-model-options"
              />
              <datalist id="pw-model-options">
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </datalist>
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={modelBusy || !modelId || (provider === 'custom' && !baseUrl)}
              onClick={() => void saveModel({ provider, modelId, ...(provider === 'custom' ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) })}
            >
              {modelBusy && <span className="loading loading-spinner loading-xs" />}
              Connect model
            </button>
            {provider !== 'custom' && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={modelBusy} onClick={() => void fetchModels()}>
                Fetch model list
              </button>
            )}
            {modelError && <span className="text-error text-xs">{modelError}</span>}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {entries.length === 0 && (
          <div className="opacity-50">
            {agentReady
              ? 'Try: "list my websites"'
              : auth.status !== 'signed-in'
                ? 'Sign in first — the agent talks to PageWeave on your behalf.'
                : modelConnected
                  ? 'Starting session…'
                  : 'Connect a model to start.'}
          </div>
        )}
        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="chat chat-end">
                <div className="chat-bubble chat-bubble-primary max-w-full whitespace-pre-wrap text-sm">{entry.text}</div>
              </div>
            )
          }
          if (entry.kind === 'tool') {
            return (
              <div key={entry.id} className="collapse collapse-arrow bg-base-200 text-xs">
                <input type="checkbox" defaultChecked={entry.running} />
                <div className="collapse-title">
                  <span className={entry.failed ? 'text-error' : 'text-info'}>
                    {entry.running ? '⟳' : entry.failed ? '✗' : '✓'}
                  </span>{' '}
                  tool: <code>{entry.toolName}</code>
                </div>
                {entry.text && <div className="collapse-content"><pre className="whitespace-pre-wrap break-all">{entry.text}</pre></div>}
              </div>
            )
          }
          if (entry.kind === 'status') {
            return (
              <div key={entry.id} className="text-xs opacity-50">
                {entry.text}
              </div>
            )
          }
          if (entry.kind === 'error') {
            return (
              <div key={entry.id} className="alert alert-error py-2 text-xs">
                <span>{entry.text}</span>
              </div>
            )
          }
          return (
            <div key={entry.id} className={`whitespace-pre-wrap text-sm ${entry.kind === 'thinking' ? 'opacity-50' : ''}`}>
              {entry.text}
              {entry.kind === 'assistant' && busy && <span className="loading loading-dots loading-xs ml-1 align-middle" />}
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-base-300 p-3">
        {promptError && <div className="mb-2 text-error text-xs">{promptError}</div>}
        <div className="flex gap-2">
          <textarea
            className="textarea textarea-bordered flex-1 text-sm"
            rows={2}
            placeholder={agentReady ? 'Ask the agent to build something…' : 'Sign in and connect a model first.'}
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
              Abort
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm self-end" disabled={!agentReady || !input.trim()} onClick={() => void send()}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
