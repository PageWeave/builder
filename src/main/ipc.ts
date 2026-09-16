import { app, ipcMain } from 'electron'
import { IpcChannel, type AppVersions } from '../shared/ipc'
import { isPingRequest } from '../engine/ping'
import type { EngineHost } from './engine-host'

/**
 * Registers the renderer-facing IPC surface. Every handler validates its
 * payload — renderer input is untrusted (see electron-security /
 * electron-ipc skills).
 */
export function registerIpcHandlers(engineHost: EngineHost): void {
  ipcMain.handle(IpcChannel.enginePing, (_event, req: unknown) => {
    if (!isPingRequest(req)) throw new Error('invalid ping request')
    return engineHost.ping(req)
  })

  ipcMain.handle(IpcChannel.appVersions, (): AppVersions => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  }))
}
