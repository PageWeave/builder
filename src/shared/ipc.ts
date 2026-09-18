/**
 * Single source of truth for the renderer↔main IPC contract and the
 * renderer↔main↔engine message envelopes.
 *
 * Both sides import from here (main/preload/engine via tsconfig.node.json,
 * renderer via tsconfig.web.json). Channel names are only ever referenced
 * through `IpcChannel` — never as raw string literals (see .opencode/skills
 * /electron-ipc/SKILL.md).
 */

/** Channels the renderer may invoke in the main process. */
export const IpcChannel = {
  /** End-to-end liveness check: renderer → main → engine → back. */
  enginePing: 'engine:ping',
  /** Static app/runtime versions. */
  appVersions: 'app:versions',
  /** Start/replace the engine model configuration (BYOK connect). */
  modelSave: 'model:save',
  /** Clear the stored model configuration and key. */
  modelClear: 'model:clear',
  /** Read the current model config (never contains the API key). */
  modelGetState: 'model:getState',
  /** List models for a provider, resolved in the engine. */
  modelList: 'model:list',
  /** Main → renderer push whenever the model config changes. */
  modelChanged: 'model:changed',
  /** Send a user prompt to the agent (response = acceptance, not completion). */
  enginePrompt: 'engine:prompt',
  /** Queue a steering message while the agent is streaming. */
  engineSteer: 'engine:steer',
  /** Abort the in-flight agent run. */
  engineAbort: 'engine:abort',
  /** Open (or create/switch) the agent session for a website scope. */
  engineOpenSession: 'engine:openSession',
  /** List stored conversations (pi sessions) for a website scope. */
  sessionList: 'session:list',
  /** List the user's PageWeave websites (engine-side direct MCP call). */
  sitesList: 'sites:list',
  /** Main → renderer push for engine streaming events. */
  engineEvent: 'engine:event',
  /** Start the OAuth sign-in flow (system browser + loopback callback). */
  authSignIn: 'auth:signIn',
  /** Revoke tokens (best effort) and wipe stored credentials. */
  authSignOut: 'auth:signOut',
  /** Read the current auth state (never contains tokens). */
  authGetState: 'auth:getState',
  /** Main → renderer push whenever the auth state changes. */
  authStateChanged: 'auth:changed',
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Request payload for `IpcChannel.enginePing`. */
export interface PingRequest {
  message: string
  sentAt: number
}

/** Response payload for `IpcChannel.enginePing`. */
export interface PongResponse {
  echo: string
  sentAt: number
  pongedAt: number
  source: 'engine'
}

/** Response payload for `IpcChannel.appVersions`. */
export interface AppVersions {
  app: string
  electron: string
  node: string
}

/** Auth lifecycle state. Tokens never cross into the renderer — status only. */
export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  /** Present when the last sign-in attempt failed; human-readable, no secrets. */
  error?: string
}

/* ------------------------------------------------------------------------- */
/* BYOK model configuration                                                   */
/* ------------------------------------------------------------------------- */

/** Providers v1 supports in the connect UI. `custom` = OpenAI-compatible. */
export const MODEL_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'custom'] as const
export type ModelProvider = (typeof MODEL_PROVIDERS)[number]

export function isModelProvider(value: unknown): value is ModelProvider {
  return typeof value === 'string' && (MODEL_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Persisted (encrypted) model configuration. The API key lives inside the
 * encrypted blob only — renderer-visible state is `ModelConfigView`.
 */
export interface ModelConfig {
  provider: ModelProvider
  /** Model id, e.g. "claude-sonnet-4-5" or a custom-endpoint model id. */
  modelId?: string
  /** Custom OpenAI-compatible endpoint (provider === 'custom' only). */
  baseUrl?: string
  apiKey?: string
}

/** Renderer-visible model config — same shape minus the key. */
export type ModelConfigView = Omit<ModelConfig, 'apiKey'> | null

/** Payload for `IpcChannel.modelSave` (partial update, key optional). */
export interface ModelSaveRequest {
  provider: ModelProvider
  modelId?: string
  baseUrl?: string
  apiKey?: string
}

/** Response for `IpcChannel.modelList`. */
export interface ModelListResponse {
  models: import('./engine-events').ModelOption[]
}

/**
 * The full bridge surface exposed as `window.pw` by the preload script.
 * Renderer code may only ever call methods on this interface.
 */
export interface PwBridge {
  engine: {
    ping(req: PingRequest): Promise<PongResponse>
    prompt(req: PromptRequest): Promise<PromptResponse>
    steer(req: SteerRequest): Promise<SteerResponse>
    abort(): Promise<AbortResponse>
    openSession(req: OpenSessionRequest): Promise<OpenSessionResponse>
    /** Lists stored conversations (pi sessions) for a website scope. */
    listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse>
    /** Subscribes to engine streaming events. Returns an unsubscribe function. */
    onEvent(listener: (event: import('./engine-events').EngineEvent) => void): () => void
  }
  sites: {
    /** Lists the user's PageWeave websites (direct MCP call in the engine). */
    list(): Promise<ListWebsitesResponse>
  }
  models: {
    save(req: ModelSaveRequest): Promise<ModelConfigView>
    clear(): Promise<ModelConfigView>
    getState(): Promise<ModelConfigView>
    list(provider: ModelProvider): Promise<ModelListResponse>
    /** Subscribes to model config pushes. Returns an unsubscribe function. */
    onChanged(listener: (config: ModelConfigView) => void): () => void
  }
  app: {
    versions(): Promise<AppVersions>
  }
  auth: {
    signIn(): Promise<AuthState>
    signOut(): Promise<AuthState>
    getState(): Promise<AuthState>
    /** Subscribes to auth state pushes. Returns an unsubscribe function. */
    onChanged(listener: (state: AuthState) => void): () => void
  }
}

/* ------------------------------------------------------------------------- */
/* Engine (utility process) ↔ main envelopes, carried over MessagePort.       */
/* ------------------------------------------------------------------------- */

/** Prompt payload. Response is acceptance; completion arrives as events. */
export interface PromptRequest {
  text: string
}
export interface PromptResponse {
  accepted: boolean
}

/** Steering message delivered after the current tool calls finish. */
export interface SteerRequest {
  text: string
}
export interface SteerResponse {
  accepted: boolean
}

export interface AbortResponse {
  aborted: boolean
}

/**
 * Session scope: one Pi session tree per website. The default re-opens the
 * most recent conversation; `fresh` starts a new one; `sessionPath` switches
 * to a specific stored conversation (validated engine-side against the
 * website's work directory).
 */
export interface OpenSessionRequest {
  websiteId: string
  /** Absolute path of a stored conversation (from list-sessions). */
  sessionPath?: string
  /** Start a brand-new conversation instead of resuming the most recent. */
  fresh?: boolean
}
export interface OpenSessionResponse {
  sessionId: string
}

/** One stored conversation (pi session file) as shown in the switcher UI. */
export interface ConversationSummary {
  /** Absolute path of the session file — opaque handle for open-session. */
  path: string
  id: string
  /** User-defined name, when set. */
  name?: string
  /** Truncated first user message — auto-title fallback. */
  firstMessage: string
  /** ISO timestamp of the last write. */
  modified: string
  messageCount: number
}
export interface ListSessionsRequest {
  websiteId: string
}
export interface ListSessionsResponse {
  conversations: ConversationSummary[]
}

/** One user website for the site picker. */
export interface WebsiteSummary {
  id: string
  name: string
  /** Dev environment URL (preview target — noindex, tracks latest). */
  devUrl?: string
  /** Live/default environment URL. */
  liveUrl?: string
}
export interface ListWebsitesResponse {
  websites: WebsiteSummary[]
}

/** Main → engine, applied to the in-memory runtime (secrets allowed here). */
export interface ConfigureRequest {
  auth?: { accessToken: string } | null
  model?: ModelConfig | null
}
export interface ConfigureResponse {
  ok: true
  sessionReady: boolean
}

/** Access-token rotation push (main refreshes proactively; see R9). */
export interface TokenUpdatedRequest {
  accessToken: string | null
}

/**
 * Absolute userData paths handed to the engine on the init envelope so it
 * keeps all pi state inside the app-managed dirs (never ~/.pi).
 */
export interface EngineInitPaths {
  agentDir: string
  workDir: string
}

/** Session scope used by the M3 debug console (real website ids arrive M4). */
export const DEBUG_WEBSITE_ID = 'debug'

export type EngineRequest =
  | { kind: 'ping'; requestId: string; payload: PingRequest }
  | { kind: 'configure'; requestId: string; payload: ConfigureRequest }
  | { kind: 'token-updated'; requestId: string; payload: TokenUpdatedRequest }
  | { kind: 'open-session'; requestId: string; payload: OpenSessionRequest }
  | { kind: 'prompt'; requestId: string; payload: PromptRequest }
  | { kind: 'steer'; requestId: string; payload: SteerRequest }
  | { kind: 'abort'; requestId: string; payload: null }
  | { kind: 'list-models'; requestId: string; payload: { provider: ModelProvider } }
  | { kind: 'list-sessions'; requestId: string; payload: ListSessionsRequest }
  | { kind: 'list-websites'; requestId: string; payload: null }

export type EngineResponse =
  | { kind: 'pong'; requestId: string; payload: PongResponse }
  | { kind: 'configured'; requestId: string; payload: ConfigureResponse }
  | { kind: 'token-updated'; requestId: string; payload: { ok: true } }
  | { kind: 'session'; requestId: string; payload: OpenSessionResponse }
  | { kind: 'prompt'; requestId: string; payload: PromptResponse }
  | { kind: 'steer'; requestId: string; payload: SteerResponse }
  | { kind: 'abort'; requestId: string; payload: AbortResponse }
  | { kind: 'models'; requestId: string; payload: ModelListResponse }
  | { kind: 'sessions'; requestId: string; payload: ListSessionsResponse }
  | { kind: 'websites'; requestId: string; payload: ListWebsitesResponse }
  | { kind: 'error'; requestId: string; message: string }

/** Every valid engine request kind, and its paired response kind. */
export const ENGINE_REQUEST_KINDS = [
  'ping',
  'configure',
  'token-updated',
  'open-session',
  'prompt',
  'steer',
  'abort',
  'list-models',
  'list-sessions',
  'list-websites',
] as const
export type EngineRequestKind = (typeof ENGINE_REQUEST_KINDS)[number]
export const ENGINE_RESPONSE_KINDS = [
  'pong',
  'configured',
  'token-updated',
  'session',
  'prompt',
  'steer',
  'abort',
  'models',
  'sessions',
  'websites',
  'error',
] as const
export type EngineResponseKind = (typeof ENGINE_RESPONSE_KINDS)[number]
