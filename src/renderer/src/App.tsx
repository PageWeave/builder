import { useCallback, useEffect, useState } from 'react'
import type {
  AppVersions,
  AuthState,
  ConversationSummary,
  ModelConfigView,
  OpenSessionRequest,
  PongResponse,
  WebsiteSummary,
} from '../../shared/ipc'
import type { EngineEvent } from '../../shared/engine-events'
import { DEBUG_WEBSITE_ID } from '../../shared/ipc'
import Sidebar from './components/Sidebar'
import DebugConsole from './components/DebugConsole'
import { useConversations, useSites } from './hooks/app-data'
import { errorMessage } from './hooks/error'

interface PingResult {
  res: PongResponse
  roundTripMs: number
}

interface SessionInfo {
  sessionId: string | null
  websiteId: string | null
}

/** Composes the opening prompt for the guided create-site flow. */
function buildCreateSitePrompt(name: string): string {
  return (
    `I'd like to create a new PageWeave website called "${name}". ` +
    'Please create it with the create_website tool — pick a suitable subdomain from the name — ' +
    'then ask me what pages it should start with.'
  )
}

/** Names of MCP tools that change the site list worth refreshing for. */
const SITE_MUTATION_TOOLS = /create_website|update_website|delete_website/

export default function App() {
  const [versions, setVersions] = useState<AppVersions | null>(null)
  const [result, setResult] = useState<PingResult | null>(null)
  const [pingError, setPingError] = useState<string | null>(null)

  const [auth, setAuth] = useState<AuthState>({ status: 'signed-out' })
  const [modelConfig, setModelConfig] = useState<ModelConfigView>(null)
  const [modelFormOpen, setModelFormOpen] = useState(false)

  const signedIn = auth.status === 'signed-in'
  const { sites, error: sitesError, refresh: refreshSites } = useSites(signedIn)
  const sitesLoading = sites === null && signedIn

  const [activeSite, setActiveSite] = useState<WebsiteSummary | null>(null)
  const [session, setSession] = useState<SessionInfo>({ sessionId: null, websiteId: null })
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [outgoing, setOutgoing] = useState<{ text: string; nonce: number } | null>(null)

  const modelConnected = modelConfig !== null && modelConfig.modelId !== undefined

  const { conversations, error: conversationsError, refresh: refreshConversations } = useConversations(
    activeSite?.id ?? null,
  )

  /* Auth + model state pushes; sign-out also invalidates the site selection. */
  useEffect(() => {
    void window.pw.auth.getState().then(setAuth).catch(() => {})
    const unsubscribeAuth = window.pw.auth.onChanged((state) => {
      setAuth(state)
      if (state.status !== 'signed-in') setActiveSite(null)
    })
    void window.pw.models.getState().then(setModelConfig).catch(() => {})
    const unsubscribeModel = window.pw.models.onChanged(setModelConfig)
    void window.pw.app.versions().then(setVersions).catch(() => {})
    return () => {
      unsubscribeAuth()
      unsubscribeModel()
    }
  }, [])

  const openSiteSession = useCallback(async (req: OpenSessionRequest): Promise<void> => {
    setSessionError(null)
    try {
      await window.pw.engine.openSession(req)
    } catch (err) {
      setSessionError(errorMessage(err))
    }
  }, [])

  /* Engine lifecycle events: session tracking + site-list maintenance. */
  useEffect(() => {
    const unsubscribe = window.pw.engine.onEvent((event: EngineEvent) => {
      switch (event.type) {
        case 'session':
          setSession({ sessionId: event.sessionId, websiteId: event.websiteId })
          break
        case 'tool_end':
          if (!event.isError && SITE_MUTATION_TOOLS.test(event.name)) void refreshSites()
          break
        case 'agent_end':
          // A fresh conversation may have been created while the agent worked.
          if (activeSite) void refreshConversations()
          break
        default:
          break
      }
    })
    return unsubscribe
  }, [refreshSites, refreshConversations, activeSite])

  const ping = useCallback(async (): Promise<void> => {
    try {
      const res = await window.pw.engine.ping({ message: 'hello from renderer', sentAt: Date.now() })
      setResult({ res, roundTripMs: Date.now() - res.sentAt })
      setPingError(null)
    } catch (err) {
      setPingError(errorMessage(err))
    }
  }, [])

  const signIn = useCallback(async (): Promise<void> => {
    setAuth(await window.pw.auth.signIn())
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    setAuth(await window.pw.auth.signOut())
  }, [])

  const selectSite = useCallback(
    (site: WebsiteSummary): void => {
      if (!modelConnected) {
        setSessionError('Connect a model first — pick a model under Connect.')
        return
      }
      setActiveSite(site)
      setSessionError(null)
      void openSiteSession({ websiteId: site.id })
    },
    [modelConnected, openSiteSession],
  )

  const newChat = useCallback((): void => {
    if (!activeSite) return
    void openSiteSession({ websiteId: activeSite.id, fresh: true })
  }, [activeSite, openSiteSession])

  const switchConversation = useCallback(
    (conversation: ConversationSummary): void => {
      if (!activeSite) return
      void openSiteSession({ websiteId: activeSite.id, sessionPath: conversation.path })
    },
    [activeSite, openSiteSession],
  )

  /** Guided create-site flow: run the prompt through the creation chat scope. */
  const createSite = useCallback(
    (name: string): void => {
      if (!modelConnected) {
        setSessionError('Connect a model first — pick a model under Connect.')
        return
      }
      setActiveSite(null)
      setSessionError(null)
      void openSiteSession({ websiteId: DEBUG_WEBSITE_ID }).then(() => {
        setOutgoing({ text: buildCreateSitePrompt(name), nonce: Date.now() })
      })
    },
    [modelConnected, openSiteSession],
  )

  /* First-run gates (per D6 UI scope): sign in → connect model → pick site. */
  const steps = [
    { id: 'auth', label: 'Sign in to PageWeave', done: signedIn },
    { id: 'model', label: 'Connect an AI model', done: modelConnected },
    { id: 'site', label: 'Pick or create a site', done: activeSite !== null },
  ] as const
  const needsAuthOrModel = !signedIn || !modelConnected

  return (
    <div className="flex h-screen flex-col">
      <header className="navbar border-b border-base-300 px-4">
        <span className="text-lg font-semibold">PageWeave Builder</span>

        <div className="ml-auto flex items-center gap-2">
          {auth.status === 'signed-out' && (
            <>
              {auth.error && <span className="max-w-72 text-error text-xs">{auth.error}</span>}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void signIn()}>
                Sign in
              </button>
            </>
          )}
          {auth.status === 'signing-in' && (
            <button type="button" className="btn btn-primary btn-sm" disabled>
              <span className="loading loading-spinner loading-xs" />
              Opening browser…
            </button>
          )}
          {auth.status === 'signed-in' && (
            <>
              <span className="text-success text-sm">Signed in</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[240px_1fr_1fr] gap-px bg-base-300">
        <div className="min-h-0">
          <Sidebar
            sites={sites}
            sitesLoading={sitesLoading}
            sitesError={sitesError}
            onRefreshSites={() => void refreshSites()}
            activeSite={activeSite}
            onSelectSite={selectSite}
            conversations={conversations}
            activeSessionId={session.sessionId}
            onSwitchConversation={switchConversation}
            onNewChat={newChat}
            onCreateSite={createSite}
            canCreateSite={signedIn && modelConnected}
          />
        </div>

        <section className="flex min-h-0 flex-col bg-base-100">
          {needsAuthOrModel && (
            <div className="border-b border-base-300 bg-base-200 px-4 py-3">
              <h2 className="mb-2 text-sm font-semibold">Getting started</h2>
              <ul className="space-y-1.5">
                {steps.map((step, index) => (
                  <li key={step.label} className="flex items-center gap-2 text-sm">
                    <span className={step.done ? 'text-success' : 'opacity-40'}>
                      {step.done ? '✓' : `${index + 1}.`}
                    </span>
                    <span className={step.done ? 'opacity-60 line-through' : ''}>{step.label}</span>
                    {!step.done && step.id === 'auth' && auth.status !== 'signing-in' && (
                      <button type="button" className="btn btn-primary btn-xs" onClick={() => void signIn()}>
                        Sign in
                      </button>
                    )}
                    {!step.done && step.id === 'model' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => setModelFormOpen(true)}
                      >
                        Connect model
                      </button>
                    )}
                    {!step.done && step.id === 'site' && (
                      <span className="text-xs opacity-50">— use the sidebar</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sessionError && (
            <div className="alert alert-error mx-3 mt-2 py-2 text-xs">
              <span>{sessionError}</span>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <DebugConsole
              auth={auth}
              modelConnected={modelConnected}
              modelFormOpen={modelFormOpen}
              onModelFormOpen={setModelFormOpen}
              outgoing={outgoing}
            />
          </div>
        </section>

        <section className="bg-base-100 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase opacity-60">Preview</h2>
          {activeSite ? (
            <p className="text-sm opacity-50">
              Live preview of “{activeSite.name}” arrives with the preview pane.
            </p>
          ) : (
            <p className="text-sm opacity-50">Select a site to preview it here.</p>
          )}
        </section>
      </main>

      <footer className="flex items-center gap-3 border-t border-base-300 px-4 py-2 text-sm">
        <button type="button" className="btn btn-primary btn-xs" onClick={() => void ping()}>
          Ping engine
        </button>
        {result && (
          <span className="text-success">
            pong “{result.res.echo}” · round trip {result.roundTripMs}ms
          </span>
        )}
        {pingError && <span className="text-error">ping failed: {pingError}</span>}
        {conversationsError && <span className="text-error">{conversationsError}</span>}
        {versions && (
          <span className="ml-auto opacity-50">
            app {versions.app} · electron {versions.electron}
          </span>
        )}
      </footer>
    </div>
  )
}
