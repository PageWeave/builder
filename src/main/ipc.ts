import { app, BrowserWindow, ipcMain } from 'electron'
import {
  DEBUG_WEBSITE_ID,
  IpcChannel,
  isModelProvider,
  type AppVersions,
  type ModelConfigView,
  type ModelListResponse,
  type ModelSaveRequest,
} from '../shared/ipc'
import { isPingRequest } from '../engine/ping'
import type { EngineHost } from './engine-host'
import type { AuthController } from './auth/controller'
import type { ModelStore } from './models/store'

/**
 * Registers the renderer-facing IPC surface. Every handler validates its
 * payload — renderer input is untrusted (see electron-security /
 * electron-ipc skills). Model/auth handlers return secret-free views only.
 */
export function registerIpcHandlers(
  engineHost: EngineHost,
  auth: AuthController,
  models: ModelStore,
): void {
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

  const broadcastModel = (config: ModelConfigView): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.modelChanged, config)
    }
  }

  ipcMain.handle(IpcChannel.modelGetState, (): ModelConfigView => models.view())

  ipcMain.handle(IpcChannel.modelSave, async (_event, req: unknown): Promise<ModelConfigView> => {
    const patch = parseModelSaveRequest(req)
    const view = await models.update(patch)
    await syncModelToEngine(engineHost, models)
    broadcastModel(view)
    return view
  })

  ipcMain.handle(IpcChannel.modelClear, async (): Promise<ModelConfigView> => {
    const view = await models.clear()
    await syncModelToEngine(engineHost, models)
    broadcastModel(view)
    return view
  })

  ipcMain.handle(IpcChannel.modelList, async (_event, provider: unknown): Promise<ModelListResponse> => {
    if (!isModelProvider(provider)) throw new Error('invalid provider')
    return engineHost.listModels(provider)
  })

  ipcMain.handle(IpcChannel.enginePrompt, async (_event, req: unknown) => {
    if (!isPromptRequest(req)) throw new Error('invalid prompt request')
    return engineHost.prompt(req)
  })

  ipcMain.handle(IpcChannel.engineSteer, async (_event, req: unknown) => {
    if (!isSteerRequest(req)) throw new Error('invalid steer request')
    return engineHost.steer(req)
  })

  ipcMain.handle(IpcChannel.engineAbort, () => engineHost.abort())

  ipcMain.handle(IpcChannel.engineOpenSession, async (_event, req: unknown) => {
    return engineHost.openSession(parseOpenSessionRequest(req))
  })

  ipcMain.handle(IpcChannel.sessionList, async (_event, req: unknown) => {
    return engineHost.listSessions(parseWebsiteScope(req))
  })

  ipcMain.handle(IpcChannel.sitesList, () => engineHost.listWebsites())
}

/** Validates the open-session payload; sessionPath details are re-checked engine-side. */
function parseOpenSessionRequest(req: unknown): { websiteId: string; sessionPath?: string; fresh?: boolean } {
  const scope = parseWebsiteScope(req)
  const record = req as Record<string, unknown>
  const result: { websiteId: string; sessionPath?: string; fresh?: boolean } = { websiteId: scope.websiteId }
  if (record.sessionPath !== undefined) {
    if (typeof record.sessionPath !== 'string' || record.sessionPath.length > 1024 || record.sessionPath.length === 0) {
      throw new Error('invalid sessionPath')
    }
    result.sessionPath = record.sessionPath
  }
  if (record.fresh !== undefined) {
    if (typeof record.fresh !== 'boolean') throw new Error('invalid fresh flag')
    result.fresh = record.fresh
  }
  return result
}

function parseWebsiteScope(req: unknown): { websiteId: string } {
  if (typeof req !== 'object' || req === null) throw new Error('invalid request')
  const websiteId = (req as { websiteId?: unknown }).websiteId
  if (typeof websiteId !== 'string' || websiteId.length === 0 || websiteId.length > 64) {
    throw new Error('invalid websiteId')
  }
  return { websiteId }
}

/**
 * Pushes the persisted model config into the engine and reopens the debug
 * session when a full model is configured. A null model clears the
 * engine-side model.
 */
export async function syncModelToEngine(engineHost: EngineHost, models: ModelStore): Promise<ModelConfigView> {
  const config = models.get()
  await engineHost.configure({ model: config ?? null })
  if (config?.modelId) {
    await engineHost.openSession({ websiteId: DEBUG_WEBSITE_ID })
  }
  return models.view()
}

function parseModelSaveRequest(req: unknown): ModelSaveRequest {
  if (typeof req !== 'object' || req === null) throw new Error('invalid model save request')
  const v = req as Record<string, unknown>
  if (!isModelProvider(v.provider)) throw new Error('invalid provider')
  const patch: ModelSaveRequest = { provider: v.provider }
  if (v.modelId !== undefined) {
    if (typeof v.modelId !== 'string' || v.modelId.length > 200) throw new Error('invalid modelId')
    patch.modelId = v.modelId
  }
  if (v.baseUrl !== undefined) {
    if (typeof v.baseUrl !== 'string' || v.baseUrl.length > 500) throw new Error('invalid baseUrl')
    try {
      const url = new URL(v.baseUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol')
    } catch {
      throw new Error('invalid baseUrl — must be an http(s) URL')
    }
    patch.baseUrl = v.baseUrl
  }
  if (v.apiKey !== undefined) {
    if (typeof v.apiKey !== 'string' || v.apiKey.length > 500) throw new Error('invalid apiKey')
    patch.apiKey = v.apiKey
  }
  return patch
}

function isPromptRequest(req: unknown): req is { text: string } {
  return typeof req === 'object' && req !== null && typeof (req as { text?: unknown }).text === 'string'
}

function isSteerRequest(req: unknown): req is { text: string } {
  return typeof req === 'object' && req !== null && typeof (req as { text?: unknown }).text === 'string'
}
