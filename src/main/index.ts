import { BrowserWindow, Menu, app, session, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { AuthController } from './auth/controller'
import { EngineHost } from './engine-host'
import { ModelStore, safeStorageModelEncryptor } from './models/store'
import { PreviewHost } from './preview'
import { IpcChannel } from '../shared/ipc'
import { isAllowedExternalUrl } from '../shared/confirm-urls'
import { registerIpcHandlers, syncModelToEngine } from './ipc'
import { mainWindowOptions } from './window'

// Sandbox every renderer globally, not per-window opt-in.
app.enableSandbox()

const engineHost = new EngineHost()
const previewHost = new PreviewHost()
let auth: AuthController | null = null
let models: ModelStore | null = null
const smokeMode = process.env.PW_SMOKE === '1'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow(mainWindowOptions(join(import.meta.dirname, '../preload/index.cjs')))
  previewHost.attach(win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => previewHost.detach())

  // Navigation fence: the app shell never navigates away. The M4 preview pane
  // gets its own WebContentsView + partition with its own fence. Allowlisted
  // https links (chat markdown links, confirmation URLs) open in the system
  // browser instead.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
  })

  // No popups, ever. https links go to the system browser (validated).
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:') void shell.openExternal(url)
    } catch {
      // malformed URL — drop silently
    }
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return win
}

/** Applies the persisted model + current token to the engine and opens the M3 debug session. */
async function syncEngineState(): Promise<void> {
  if (!models) return
  try {
    await syncModelToEngine(engineHost, models)
  } catch (err) {
    // Expected on first run (no model yet) — the connect UI handles the rest.
    console.log(`[pw] engine state not applied yet: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Application menu: Edit roles (clipboard) + View menu with the debug console toggle. */
function setupMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Debug Console',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) win.webContents.send(IpcChannel.debugToggle)
            }
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

void app.whenReady().then(() => {
  // Deny-all permission requests and checks on the default session.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  setupMenu()

  const userData = app.getPath('userData')
  auth = new AuthController({ storePath: join(userData, 'auth.enc') })
  models = new ModelStore(join(userData, 'model.enc'), safeStorageModelEncryptor)

  auth.onState((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.authStateChanged, state)
    }
  })

  // Token rotation → engine (MCP bearer freshness; see RISKS R9).
  auth.onAccessToken((accessToken) => {
    void engineHost.pushToken({ accessToken }).catch((err: unknown) => {
      console.error(`[pw] engine token push failed: ${String(err)}`)
    })
  })

  // Engine streaming events → every renderer window.
  engineHost.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.engineEvent, event)
    }
  })

  registerIpcHandlers(engineHost, auth, models, previewHost)
  engineHost.start({
    agentDir: join(userData, 'agent'),
    workDir: join(userData, 'work'),
  })
  createWindow()
  console.log('[pw] window created')

  // Restore persisted auth (local file + refresh if needed). Network only
  // happens when a previous session left a refresh token behind.
  void auth
    .init()
    .then(() => models!.load())
    .then(() => syncEngineState())
    .catch((err: unknown) => {
      console.error(`[pw] startup state restore failed: ${String(err)}`)
    })

  // Startup self-check of the full renderer→main→engine loop. Also the CI
  // smoke signal (PW_SMOKE=1 quits right after).
  engineHost
    .ping({ message: 'startup self-check', sentAt: Date.now() })
    .then(() => {
      console.log('[pw] engine pong ok')
      if (smokeMode) app.quit()
    })
    .catch((err: unknown) => {
      console.error(`[pw] engine self-check failed: ${String(err)}`)
      if (smokeMode) app.exit(1)
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  engineHost.stop()
  auth?.dispose()
})
