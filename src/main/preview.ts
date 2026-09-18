import { WebContentsView, session, type BrowserWindow } from 'electron'
import type { PreviewBounds } from '../shared/ipc'
import { isAllowedExternalUrl } from '../shared/confirm-urls'

/**
 * Owns the site-preview pane: one WebContentsView stacked above the renderer
 * inside the main window's contentView. The renderer reserves a layout gap
 * and reports its rect (window-content coordinates) via IPC; this class only
 * ever applies validated values.
 *
 * Security posture (electron-security skill): dedicated persistent partition
 * (the dev env's password cookie survives restarts — the user enters it
 * once), sandboxed, no preload, deny-all permissions, window-open denied,
 * navigation fenced to PageWeave-controlled hosts (same allowlist as chat
 * links).
 */

const PREVIEW_PARTITION = 'persist:pw-preview'

export class PreviewHost {
  private view: WebContentsView | null = null
  private win: BrowserWindow | null = null
  private currentUrl: string | null = null
  private bounds: PreviewBounds | null = null

  attach(win: BrowserWindow): void {
    this.win = win
  }

  /** Applies bounds from the renderer (untrusted payload — validated here). */
  setBounds(raw: PreviewBounds | null): void {
    if (raw === null) {
      this.bounds = null
      if (this.view) this.view.setVisible(false)
      return
    }
    if (!isFiniteBounds(raw)) throw new Error('invalid preview bounds')
    this.bounds = raw
    if (!this.view) return
    this.view.setBounds(raw)
    this.view.setVisible(true)
  }

  /** Loads a URL into the preview view (validated: https + PageWeave hosts). */
  load(url: string): void {
    if (!isAllowedExternalUrl(url)) throw new Error('preview URL not allowed')
    this.currentUrl = url
    const win = this.win
    if (!win || win.isDestroyed()) return
    const view = this.ensureView()
    view.setBounds(this.bounds ?? defaultBounds(win))
    view.setVisible(this.bounds !== null)
    void view.webContents.loadURL(url)
  }

  refresh(): void {
    if (this.currentUrl && this.view) void this.view.webContents.loadURL(this.currentUrl)
  }

  /** Tears the view down (window close / app quit). */
  detach(): void {
    const view = this.view
    this.view = null
    this.currentUrl = null
    this.bounds = null
    if (view) {
      try {
        view.webContents.close()
      } catch {
        // Best-effort; view destruction may already be underway.
      }
    }
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view
    const hardened = session.fromPartition(PREVIEW_PARTITION)
    hardened.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    hardened.setPermissionCheckHandler(() => false)

    const view = new WebContentsView({
      webPreferences: {
        partition: PREVIEW_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        // No preload — remote content gets no privileged bridge.
      },
    })
    view.setBackgroundColor('#ffffff')
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (event, url) => {
      // In-page navigation stays inside PageWeave-controlled hosts only.
      if (!isAllowedExternalUrl(url)) event.preventDefault()
    })
    const win = this.win
    if (win && !win.isDestroyed()) win.contentView.addChildView(view)
    this.view = view
    return view
  }
}

function isFiniteBounds(raw: PreviewBounds): boolean {
  return (
    [raw.x, raw.y, raw.width, raw.height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    raw.width >= 0 &&
    raw.height >= 0
  )
}

function defaultBounds(win: BrowserWindow): PreviewBounds {
  const [contentWidth, contentHeight] = win.getContentSize()
  return { x: 0, y: 0, width: contentWidth ?? 1280, height: contentHeight ?? 800 }
}
