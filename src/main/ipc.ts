import { app, ipcMain } from 'electron'
import { IpcChannel, type AppVersions } from '../shared/ipc'
import { isPingRequest } from '../engine/ping'
import type { EngineHost } from './engine-host'
import type { AuthController } from './auth/controller'

/**
 * Registers the renderer-facing IPC surface. Every handler validates its
 * payload — renderer input is untrusted (see electron-security /
 * electron-ipc skills).
 */
export function registerIpcHandlers(engineHost: EngineHost, auth: AuthController): void {
  ipcMain.handle(IpcChannel.enginePing, (_event, req: unknown) => {
    if (!isPingRequest(req)) throw new Error('invalid ping request')
    return engineHost.ping(req)
  })

  ipcMain.handle(IpcChannel.appVersions, (): AppVersions => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  }))

  // Auth handlers take no payload — nothing to validate. They return state
  // only; tokens never cross this boundary.
  ipcMain.handle(IpcChannel.authSignIn, () => auth.signIn())
  ipcMain.handle(IpcChannel.authSignOut, () => auth.signOut())
  ipcMain.handle(IpcChannel.authGetState, () => auth.getState())
}
