import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebsiteSummary } from '../../../shared/ipc'

interface PreviewPaneProps {
  site: WebsiteSummary | null
  /** Extra refresh signal (e.g. after the agent edited the site). */
  refreshNonce: number
}

/**
 * Right pane: reserves the layout gap that the main-process WebContentsView
 * fills, reports its rect (throttled via ResizeObserver), and drives
 * load/refresh. The native view renders ABOVE the renderer — this div must
 * stay empty so the site content is visible.
 */
export default function PreviewPane({ site, refreshNonce }: PreviewPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const url = site?.devUrl ?? site?.liveUrl

  const refresh = useCallback((): void => {
    void window.pw.preview.refresh().catch(() => {})
  }, [])

  /* Hide the view when there is nothing to show. */
  useEffect(() => {
    if (!site || !url) void window.pw.preview.setBounds(null).catch(() => {})
  }, [site, url])

  /* Load + bounds tracking for the active site. */
  useEffect(() => {
    const element = containerRef.current
    if (!site || !url || !element) return
    setOpenError(null)
    void window.pw.preview.load({ url }).catch((err: unknown) => {
      setOpenError(err instanceof Error ? err.message : String(err))
    })

    let rafId = 0
    const sendBounds = (): void => {
      const rect = element.getBoundingClientRect()
      void window.pw.preview
        .setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        .catch(() => {})
    }
    const scheduleBounds = (): void => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(sendBounds)
    }
    const observer = new ResizeObserver(scheduleBounds)
    observer.observe(element)
    window.addEventListener('resize', scheduleBounds)
    sendBounds()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleBounds)
      cancelAnimationFrame(rafId)
    }
  }, [site, url])

  /* Explicit refresh triggers (manual button + engine-edit nonce). */
  useEffect(() => {
    if (!site || !url || refreshNonce === 0) return
    void window.pw.preview.refresh().catch(() => {})
  }, [site, url, refreshNonce])

  const openInBrowser = useCallback((): void => {
    if (url) void window.pw.app.openExternal(url).catch(() => {})
  }, [url])

  return (
    <section className="flex h-full min-h-0 flex-col bg-base-100">
      <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase opacity-60">Preview</h2>
        {site && (
          <span className="badge badge-ghost badge-sm max-w-32 truncate" title={site.name}>
            {site.name}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            title="Reload preview"
            disabled={!url}
            onClick={refresh}
          >
            ↻
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            title="Open in browser"
            disabled={!url}
            onClick={openInBrowser}
          >
            ↗
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* The native WebContentsView covers this area; content here shows when it's hidden. */}
        <div ref={containerRef} className="absolute inset-0">
          {!site && (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm opacity-50">
              Select a site to see its live preview here.
            </div>
          )}
          {site && !url && (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm opacity-50">
              No preview URL for this site yet.
            </div>
          )}
          {site && url && openError && (
            <div className="alert alert-error m-3 py-2 text-xs">
              <span>{openError}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
