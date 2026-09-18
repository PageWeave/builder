import { useCallback, useEffect, useState } from 'react'
import type { ConversationSummary, WebsiteSummary } from '../../../shared/ipc'
import { errorMessage } from './error'

/**
 * Hook over the engine's site-picker surface (engine-side direct MCP call).
 * sites === null means loading (signed in, no result yet) or signed out —
 * the shell distinguishes the two.
 */
export interface SitesState {
  /** null = loading / not available (signed out). */
  sites: WebsiteSummary[] | null
  error: string | null
  refresh: () => Promise<void>
}

export function useSites(signedIn: boolean): SitesState {
  const [loaded, setLoaded] = useState<WebsiteSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* Subscribe to the (signed-in-only) data source; setState only in async callbacks. */
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void window.pw.sites
      .list()
      .then((res) => {
        if (cancelled) return
        setLoaded(res.websites)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoaded([])
        setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const refresh = useCallback(async (): Promise<void> => {
    if (!signedIn) return
    try {
      const res = await window.pw.sites.list()
      setLoaded(res.websites)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [signedIn])

  return { sites: signedIn ? loaded : null, error, refresh }
}

/** Stored conversations for the active site; null = loading or no site. */
export function useConversations(websiteId: string | null): {
  conversations: ConversationSummary[] | null
  error: string | null
  refresh: () => Promise<void>
} {
  const [loaded, setLoaded] = useState<ConversationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    void window.pw.engine
      .listSessions({ websiteId })
      .then((res) => {
        if (cancelled) return
        setLoaded(res.conversations)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [websiteId])

  const refresh = useCallback(async (): Promise<void> => {
    if (!websiteId) return
    try {
      const res = await window.pw.engine.listSessions({ websiteId })
      setLoaded(res.conversations)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [websiteId])

  return { conversations: websiteId !== null ? loaded : null, error, refresh }
}
