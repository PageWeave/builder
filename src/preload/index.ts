import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AppVersions, type PingRequest, type PongResponse, type PwBridge } from '../shared/ipc'

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
}

contextBridge.exposeInMainWorld('pw', bridge)
