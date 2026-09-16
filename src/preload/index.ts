import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type AppVersions,
  type AuthState,
  type PingRequest,
  type PongResponse,
  type PwBridge,
} from '../shared/ipc'

/**
 * The ONLY privileged surface the renderer gets: the typed `window.pw` bridge
 * defined in src/shared/ipc.ts. Thin forwarder — no logic, no raw ipcRenderer
 * exposure (see electron-security / electron-ipc skills).
 */
const bridge: PwBridge = {
  engine: {
    ping: (req: PingRequest): Promise<PongResponse> => ipcRenderer.invoke(IpcChannel.enginePing, req),
  },
  app: {
    versions: (): Promise<AppVersions> => ipcRenderer.invoke(IpcChannel.appVersions),
  },
  auth: {
    signIn: (): Promise<AuthState> => ipcRenderer.invoke(IpcChannel.authSignIn),
    signOut: (): Promise<AuthState> => ipcRenderer.invoke(IpcChannel.authSignOut),
    getState: (): Promise<AuthState> => ipcRenderer.invoke(IpcChannel.authGetState),
    onChanged: (listener: (state: AuthState) => void): (() => void) => {
      const wrapped = (_event: unknown, state: AuthState): void => listener(state)
      ipcRenderer.on(IpcChannel.authStateChanged, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcChannel.authStateChanged, wrapped)
      }
    },
  },
}

contextBridge.exposeInMainWorld('pw', bridge)
