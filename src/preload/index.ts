import { contextBridge, ipcRenderer } from 'electron'
import type { EngineEvent } from '../shared/engine-events'
import {
  IpcChannel,
  type AbortResponse,
  type AppVersions,
  type AuthState,
  type ModelConfigView,
  type ModelListResponse,
  type ModelSaveRequest,
  type ModelProvider,
  type OpenSessionRequest,
  type OpenSessionResponse,
  type PingRequest,
  type PongResponse,
  type PromptRequest,
  type PromptResponse,
  type PwBridge,
  type SteerRequest,
  type SteerResponse,
} from '../shared/ipc'

/**
 * The ONLY privileged surface the renderer gets: the typed `window.pw` bridge
 * defined in src/shared/ipc.ts. Thin forwarder — no logic, no raw ipcRenderer
 * exposure (see electron-security / electron-ipc skills).
 */
const bridge: PwBridge = {
  engine: {
    ping: (req: PingRequest): Promise<PongResponse> => ipcRenderer.invoke(IpcChannel.enginePing, req),
    prompt: (req: PromptRequest): Promise<PromptResponse> => ipcRenderer.invoke(IpcChannel.enginePrompt, req),
    steer: (req: SteerRequest): Promise<SteerResponse> => ipcRenderer.invoke(IpcChannel.engineSteer, req),
    abort: (): Promise<AbortResponse> => ipcRenderer.invoke(IpcChannel.engineAbort),
    openSession: (req: OpenSessionRequest): Promise<OpenSessionResponse> =>
      ipcRenderer.invoke(IpcChannel.engineOpenSession, req),
    onEvent: (listener: (event: EngineEvent) => void): (() => void) => {
      const wrapped = (_event: unknown, event: EngineEvent): void => listener(event)
      ipcRenderer.on(IpcChannel.engineEvent, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcChannel.engineEvent, wrapped)
      }
    },
  },
  models: {
    save: (req: ModelSaveRequest): Promise<ModelConfigView> => ipcRenderer.invoke(IpcChannel.modelSave, req),
    clear: (): Promise<ModelConfigView> => ipcRenderer.invoke(IpcChannel.modelClear),
    getState: (): Promise<ModelConfigView> => ipcRenderer.invoke(IpcChannel.modelGetState),
    list: (provider: ModelProvider): Promise<ModelListResponse> => ipcRenderer.invoke(IpcChannel.modelList, provider),
    onChanged: (listener: (config: ModelConfigView) => void): (() => void) => {
      const wrapped = (_event: unknown, config: ModelConfigView): void => listener(config)
      ipcRenderer.on(IpcChannel.modelChanged, wrapped)
      return () => {
        ipcRenderer.removeListener(IpcChannel.modelChanged, wrapped)
      }
    },
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
