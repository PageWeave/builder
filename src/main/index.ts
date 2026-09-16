import { BrowserWindow, app, session, shell } from 'electron'
import { join } from 'node:path'
import { EngineHost } from './engine-host'
import { registerIpcHandlers } from './ipc'
import { mainWindowOptions } from './window'

// Sandbox every renderer globally, not per-window opt-in.
app.enableSandbox()

const engineHost = new EngineHost()
const smokeMode = process.env.PW_SMOKE === '1'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow(mainWindowOptions(join(import.meta.dirname, '../preload/index.cjs')))
  win.on('ready-to-show', () => win.show())

  // Navigation fence: the app shell never navigates away. The M4 preview pane
  // gets its own WebContentsView + partition with its own fence.
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
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

void app.whenReady().then(() => {
  // Deny-all permission requests and checks on the default session.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  registerIpcHandlers(engineHost)
  engineHost.start()
  createWindow()
  console.log('[pw] window created')

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

app.on('before-quit', () => engineHost.stop())
