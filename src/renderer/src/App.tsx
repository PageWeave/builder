import { useCallback, useEffect, useState } from 'react'
import type { AppVersions, AuthState, PongResponse } from '../../shared/ipc'

type Versions = AppVersions

interface PingResult {
  res: PongResponse
  roundTripMs: number
}

export default function App() {
  const [result, setResult] = useState<PingResult | null>(null)
  const [pingError, setPingError] = useState<string | null>(null)
  const [versions, setVersions] = useState<Versions | null>(null)
  const [auth, setAuth] = useState<AuthState>({ status: 'signed-out' })

  const ping = useCallback(async () => {
    try {
      const res = await window.pw.engine.ping({ message: 'hello from renderer', sentAt: Date.now() })
      setResult({ res, roundTripMs: Date.now() - res.sentAt })
      setPingError(null)
    } catch (err) {
      setPingError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const signIn = useCallback(async () => {
    setAuth(await window.pw.auth.signIn())
  }, [])

  const signOut = useCallback(async () => {
    setAuth(await window.pw.auth.signOut())
  }, [])

  useEffect(() => {
    void window.pw.auth
      .getState()
      .then(setAuth)
      .catch(() => {})
    const unsubscribe = window.pw.auth.onChanged(setAuth)
    return unsubscribe
  }, [])

  useEffect(() => {
    void window.pw.engine
      .ping({ message: 'hello from renderer', sentAt: Date.now() })
      .then((res) => {
        setResult({ res, roundTripMs: Date.now() - res.sentAt })
        setPingError(null)
      })
      .catch((err: unknown) => {
        setPingError(err instanceof Error ? err.message : String(err))
      })
    void window.pw.app.versions().then(setVersions).catch(() => setVersions(null))
  }, [])

  return (
    <div className="flex h-screen flex-col">
      <header className="navbar border-b border-base-300 px-4">
        <span className="text-lg font-semibold">PageWeave Builder</span>
        <span className="badge badge-outline badge-sm ml-2">skeleton</span>

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

      <main className="grid flex-1 grid-cols-[240px_1fr_1fr] gap-px bg-base-300">
        <aside className="bg-base-100 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase opacity-60">Sites</h2>
          <p className="text-sm opacity-50">Site picker — M4</p>
        </aside>

        <section className="bg-base-100 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase opacity-60">Chat</h2>
          <p className="text-sm opacity-50">Agent chat — M4</p>
        </section>

        <section className="bg-base-100 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase opacity-60">Preview</h2>
          <p className="text-sm opacity-50">Site preview — M4</p>
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
        {versions && (
          <span className="ml-auto opacity-50">
            app {versions.app} · electron {versions.electron}
          </span>
        )}
      </footer>
    </div>
  )
}
