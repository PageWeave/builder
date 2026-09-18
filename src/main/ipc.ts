import { app, BrowserWindow, ipcMain, shell } from 'electron'
import {
  IpcChannel,
  isModelProvider,
  type AppVersions,
  type AuthState,
  type ModelConfigView,
  type ModelListResponse,
  type ModelSaveRequest,
  type PreviewBounds,
} from '../shared/ipc'
import { isAllowedExternalUrl } from '../shared/confirm-urls'
import { isPingRequest } from '../engine/ping'
import { E2E_CONVERSATIONS, E2E_MODEL_VIEW, E2E_SESSION_ID, E2E_SITES, e2ePromptEvents, isE2E } from './e2e'
import type { EngineHost } from './engine-host'
import type { AuthController } from './auth/controller'
import type { ModelStore } from './models/store'
import type { PreviewHost } from './preview'

/**
 * Registers the renderer-facing IPC surface. Every handler validates its
 * payload — renderer input is untrusted (see electron-security /
 * electron-ipc skills). Model/auth handlers return secret-free views only.
 */
export function registerIpcHandlers(
  engineHost: EngineHost,
  auth: AuthController,
  models: ModelStore,
  preview: PreviewHost,
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

  ipcMain.handle(IpcChannel.appOpenExternal, (_event, raw: unknown): void => {
    if (typeof raw !== 'string' || raw.length > 2048) throw new Error('invalid url')
    if (!isAllowedExternalUrl(raw)) throw new Error('url not allowed')
    void shell.openExternal(raw)
  })

  // Auth handlers take no payload — nothing to validate. They return state
  // only; tokens never cross this boundary.
  ipcMain.handle(IpcChannel.authSignIn, (): AuthState | Promise<AuthState> => {
    if (isE2E()) return { status: 'signed-in' }
    return auth.signIn()
  })
  ipcMain.handle(IpcChannel.authSignOut, () => auth.signOut())
  ipcMain.handle(IpcChannel.authGetState, () => auth.getState())

  const broadcastModel = (config: ModelConfigView): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.modelChanged, config)
    }
  }

  ipcMain.handle(IpcChannel.modelGetState, (): ModelConfigView => (isE2E() ? E2E_MODEL_VIEW : models.view()))

  ipcMain.handle(IpcChannel.modelSave, async (_event, req: unknown): Promise<ModelConfigView> => {
    const patch = parseModelSaveRequest(req)
    if (isE2E()) {
      broadcastModel(E2E_MODEL_VIEW)
      return E2E_MODEL_VIEW
    }
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
    if (isE2E()) {
      return {
        models: [{ provider, id: 'e2e-model', name: 'E2E Model', contextWindow: 128_000, reasoning: false }],
      }
    }
    return engineHost.listModels(provider)
  })

  ipcMain.handle(IpcChannel.enginePrompt, async (_event, req: unknown) => {
    if (!isPromptRequest(req)) throw new Error('invalid prompt request')
    if (isE2E()) {
      engineHost.emitTestEvents(e2ePromptEvents())
      return { accepted: true }
    }
    return engineHost.prompt(req)
  })

  ipcMain.handle(IpcChannel.engineSteer, async (_event, req: unknown) => {
    if (!isSteerRequest(req)) throw new Error('invalid steer request')
    return engineHost.steer(req)
  })

  ipcMain.handle(IpcChannel.engineAbort, () => engineHost.abort())

  ipcMain.handle(IpcChannel.engineOpenSession, async (_event, req: unknown) => {
    const parsed = parseOpenSessionRequest(req)
    if (isE2E()) {
      engineHost.emitTestEvents([{ type: 'session', sessionId: E2E_SESSION_ID, websiteId: parsed.websiteId }])
      return { sessionId: E2E_SESSION_ID }
    }
    return engineHost.openSession(parsed)
  })

  ipcMain.handle(IpcChannel.sessionList, async (_event, req: unknown) => {
    parseWebsiteScope(req)
    if (isE2E()) return { conversations: E2E_CONVERSATIONS }
    return engineHost.listSessions(parseWebsiteScope(req))
  })

  ipcMain.handle(IpcChannel.sitesList, () => (isE2E() ? { websites: E2E_SITES } : engineHost.listWebsites()))

  ipcMain.handle(IpcChannel.previewSetBounds, (_event, raw: unknown): void => {
    preview.setBounds(parsePreviewBounds(raw))
  })

  ipcMain.handle(IpcChannel.previewLoad, (_event, req: unknown): void => {
    if (typeof req !== 'object' || req === null) throw new Error('invalid preview request')
    const url = (req as { url?: unknown }).url
    if (typeof url !== 'string' || url.length > 2048) throw new Error('invalid preview url')
    preview.load(url)
  })

  ipcMain.handle(IpcChannel.previewRefresh, (): void => {
    preview.refresh()
  })
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

/** Renderer-reported bounds are untrusted: shape + finiteness validated (details in preview.ts). */
function parsePreviewBounds(raw: unknown): PreviewBounds | null {
  if (raw === null) return null
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid preview bounds')
  const record = raw as { x?: number; y?: number; width?: number; height?: number }
  const { x, y, width, height } = record
  for (const value of [x, y, width, height]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid preview bounds')
  }
  if (typeof width === 'number' && width < 0) throw new Error('invalid preview bounds')
  if (typeof height === 'number' && height < 0) throw new Error('invalid preview bounds')
  return { x: x as number, y: y as number, width: width as number, height: height as number }
}

/**
 * Pushes the persisted model config into the engine and reopens the last
 * session scope (debug scope until the user picks a site at M4). A null
 * model clears the engine-side model.
 */
export async function syncModelToEngine(engineHost: EngineHost, models: ModelStore): Promise<ModelConfigView> {
  const config = models.get()
  await engineHost.configure({ model: config ?? null })
  if (config?.modelId) {
    await engineHost.reopenLastSession()
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
