/**
 * Auto-update (M5). electron-updater reads the feed from the generated
 * app-update.yml (electron-builder.yml § publish → GitHub Releases drafts)
 * and verifies release signatures — do not disable that.
 *
 * Posture for non-technical users: fully automatic. Check shortly after
 * launch, download silently, install on quit; "Check for Updates…" in the
 * Help menu offers an immediate restart when a build is already downloaded.
 *
 * Electron singletons live behind a deps object (house DI style, cf.
 * EngineHost/ModelStore) so the wiring is unit-testable without mocking.
 */
import { app, dialog, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Interval between background update checks: 4 hours. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Fires the first check this long after launch so boot stays snappy. */
const FIRST_CHECK_DELAY_MS = 5_000

/** The slice of electron-updater's autoUpdater we use. */
export type AutoUpdaterLike = Pick<
  typeof autoUpdater,
  'autoDownload' | 'autoInstallOnAppQuit' | 'logger' | 'on' | 'checkForUpdates' | 'quitAndInstall'
>

export interface UpdaterDeps {
  autoUpdater: AutoUpdaterLike
  dialog: Pick<typeof dialog, 'showMessageBox'>
  getVersion: () => string
  /** Updates only make sense in a packaged build (never dev/E2E/smoke). */
  packaged: boolean
  smoke: boolean
  windows: () => BrowserWindow[]
  log: (message: string) => void
}

export interface UpdaterController {
  /** Idempotent: starts background checks. Call once after app ready. */
  init(): void
  /** Manual "Check for Updates…" — always gives visible feedback. */
  checkInteractive(): Promise<void>
}

export function updatesEnabled(deps: Pick<UpdaterDeps, 'packaged' | 'smoke'>): boolean {
  return deps.packaged && !deps.smoke
}

export function createUpdaterController(deps: UpdaterDeps): UpdaterController {
  const { autoUpdater } = deps

  async function promptRestart(version: string): Promise<void> {
    const win = deps.windows().find((w) => !w.isDestroyed()) ?? null
    const options = {
      type: 'info' as const,
      message: `PageWeave Builder ${version} is ready to install.`,
      detail: 'It will install automatically next time you quit. Restart now to use it right away?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }
    const { response } = win
      ? await deps.dialog.showMessageBox(win, options)
      : await deps.dialog.showMessageBox(options)
    if (response === 0) autoUpdater.quitAndInstall()
  }

  return {
    init(): void {
      if (!updatesEnabled(deps)) return

      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.logger = { info: deps.log, warn: deps.log, error: deps.log }

      // Update failures are never fatal — log and carry on.
      autoUpdater.on('error', (err) => {
        deps.log(`[pw] update check failed: ${err.message}`)
      })

      autoUpdater.on('update-downloaded', (info) => {
        void promptRestart(info.version)
      })

      setTimeout(() => {
        void autoUpdater.checkForUpdates()
        const interval = setInterval(() => void autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS)
        interval.unref?.()
      }, FIRST_CHECK_DELAY_MS)
    },

    async checkInteractive(): Promise<void> {
      if (!updatesEnabled(deps)) {
        await deps.dialog.showMessageBox({
          type: 'info',
          message: 'Updates are disabled while running from source.',
        })
        return
      }
      try {
        const result = await autoUpdater.checkForUpdates()
        if (result?.updateInfo.version === deps.getVersion()) {
          await deps.dialog.showMessageBox({
            type: 'info',
            message: `You're up to date.`,
            detail: `PageWeave Builder ${deps.getVersion()} is the newest version.`,
          })
        }
        // Otherwise update-downloaded (or autoInstallOnAppQuit) handles UX.
      } catch (err) {
        await deps.dialog.showMessageBox({
          type: 'warning',
          message: 'Could not check for updates.',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }
}

/** Real-deps controller. One per process; menu + whenReady share it. */
export function createAppUpdater(): UpdaterController {
  return createUpdaterController({
    autoUpdater,
    dialog,
    getVersion: () => app.getVersion(),
    packaged: app.isPackaged,
    smoke: process.env.PW_SMOKE === '1',
    windows: () => BrowserWindow.getAllWindows(),
    log: (message) => console.log(message),
  })
}
