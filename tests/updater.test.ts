import { describe, expect, it, vi } from 'vitest'
import { createUpdaterController, updatesEnabled, type AutoUpdaterLike, type UpdaterDeps } from '../src/main/updater'

/** Minimal event-emitter stand-in for electron-updater's autoUpdater. */
function fakeUpdater(
  checkForUpdates: () => Promise<unknown> = () => Promise.resolve(null),
): AutoUpdaterLike & { emit(kind: string, payload: unknown): void; handlers: Map<string, Array<(payload: never) => void>> } {
  const handlers = new Map<string, Array<(payload: never) => void>>()
  return {
    handlers,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on(kind: string, listener: (payload: never) => void) {
      const list = handlers.get(kind) ?? []
      list.push(listener)
      handlers.set(kind, list)
      return undefined as never
    },
    checkForUpdates: vi.fn(() => checkForUpdates()) as unknown as AutoUpdaterLike['checkForUpdates'],
    quitAndInstall: vi.fn(),
    emit(kind: string, payload: unknown) {
      for (const listener of handlers.get(kind) ?? []) listener(payload as never)
    },
  } as never
}

/** `response` is what the fake dialog answers; `feed` is what checkForUpdates resolves. */
function fakeDeps(
  options: { response?: number; feed?: () => Promise<unknown>; packaged?: boolean; smoke?: boolean } = {},
): { deps: UpdaterDeps; updater: ReturnType<typeof fakeUpdater>; boxes: unknown[] } {
  const updater = fakeUpdater(options.feed)
  const boxes: unknown[] = []
  const deps: UpdaterDeps = {
    autoUpdater: updater,
    dialog: {
      showMessageBox: vi.fn((...args: unknown[]) => {
        boxes.push(args)
        return Promise.resolve({ response: options.response ?? 1 } as never)
      }),
    },
    getVersion: () => '1.2.3',
    packaged: options.packaged ?? true,
    smoke: options.smoke ?? false,
    windows: () => [],
    log: vi.fn(),
  }
  return { deps, updater, boxes }
}

describe('updatesEnabled', () => {
  it('runs only in packaged, non-smoke builds', () => {
    expect(updatesEnabled({ packaged: true, smoke: false })).toBe(true)
    expect(updatesEnabled({ packaged: false, smoke: false })).toBe(false)
    expect(updatesEnabled({ packaged: true, smoke: true })).toBe(false)
  })
})

describe('createUpdaterController — background mode', () => {
  it('is inert when not packaged', () => {
    const { deps, updater } = fakeDeps({ packaged: false })
    vi.useFakeTimers()
    createUpdaterController(deps).init()
    vi.advanceTimersByTime(10_000)
    vi.useRealTimers()
    expect(updater.autoDownload).toBe(false)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.handlers.has('update-downloaded')).toBe(false)
  })

  it('configures silent download + install on quit and checks after launch', () => {
    const { deps, updater } = fakeDeps()
    vi.useFakeTimers()
    createUpdaterController(deps).init()
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5_000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(4 * 60 * 60 * 1000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('restart prompt on update-downloaded honors the "Restart now" answer', async () => {
    const { deps, updater } = fakeDeps({ response: 0 })
    createUpdaterController(deps).init()

    updater.emit('update-downloaded', { version: '9.9.9' })
    await vi.waitFor(() => expect(deps.dialog.showMessageBox).toHaveBeenCalled())
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('keeps running when the chosen answer is "Later"', async () => {
    const { deps, updater } = fakeDeps()
    createUpdaterController(deps).init()

    updater.emit('update-downloaded', { version: '9.9.9' })
    await vi.waitFor(() => expect(deps.dialog.showMessageBox).toHaveBeenCalled())
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('logs update errors instead of crashing', async () => {
    const { deps, updater } = fakeDeps()
    createUpdaterController(deps).init()

    updater.emit('error', new Error('network down'))
    await vi.waitFor(() =>
      expect(deps.log).toHaveBeenCalledWith('[pw] update check failed: network down'),
    )
  })
})

describe('createUpdaterController — interactive check', () => {
  it('tells source builds that updates are disabled', async () => {
    const { deps, boxes } = fakeDeps({ packaged: false })
    await createUpdaterController(deps).checkInteractive()
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    const [box] = boxes[0] as [{ message: string }]
    expect(box.message).toContain('disabled')
  })

  it('reports up-to-date when the feed matches the running version', async () => {
    const { deps, boxes } = fakeDeps({ feed: () => Promise.resolve({ updateInfo: { version: '1.2.3' } }) })
    await createUpdaterController(deps).checkInteractive()
    const [box] = boxes[0] as [{ message: string }]
    expect(box.message).toContain('up to date')
  })

  it('stays quiet when a newer version is in flight (downloaded dialog handles UX)', async () => {
    const { deps } = fakeDeps({ feed: () => Promise.resolve({ updateInfo: { version: '2.0.0' } }) })
    await createUpdaterController(deps).checkInteractive()
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('surfaces feed failures as a warning dialog', async () => {
    const { deps } = fakeDeps({ feed: () => Promise.reject(new Error('404')) })
    await createUpdaterController(deps).checkInteractive()
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', detail: '404' }),
    )
  })
})
