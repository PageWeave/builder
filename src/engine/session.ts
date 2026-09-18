import { mkdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSession,
  type ExtensionAPI,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent'
import { InMemoryCredentialStore, type Api, type Model } from '@earendil-works/pi-ai'
import { createMcpAdapter } from 'pi-mcp-adapter'
import type {
  ConfigureRequest,
  ConfigureResponse,
  ConversationSummary,
  ListSessionsRequest,
  ListSessionsResponse,
  ListWebsitesResponse,
  ModelConfig,
  ModelListResponse,
  OpenSessionRequest,
  OpenSessionResponse,
  PromptRequest,
  SteerRequest,
} from '../shared/ipc'
import type { EngineEvent, ModelOption } from '../shared/engine-events'
import { isModelProvider } from '../shared/ipc'
import { mapHistoryMessages, mapSessionEvents } from './events'
import { ACCESS_TOKEN_ENV, buildMcpAdapterConfig } from './mcp-config'
import { buildSystemPrompt } from './prompt'
import { fetchWebsites } from './site-client'
import { syncBundledSkills } from './skills'

/**
 * Built-in providers whose API keys are injected via ModelRuntime runtime
 * overrides (never persisted; see DECISIONS D14). `custom` is handled by
 * registering an OpenAI-compatible provider through an inline extension.
 */
const BUILTIN_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter'] as const
export type BuiltinProvider = (typeof BUILTIN_PROVIDERS)[number]

export function isBuiltinProvider(provider: string): provider is BuiltinProvider {
  return (BUILTIN_PROVIDERS as readonly string[]).includes(provider)
}

export interface SessionRunnerOptions {
  /** App-managed pi agent dir (<userData>/agent). Never ~/.pi. */
  agentDir: string
  /** Parent dir for per-website working directories (<userData>/work). */
  workDir: string
  /** Event sink (engine → main notices). */
  emit: (event: import('../shared/engine-events').EngineEvent) => void
}

/**
 * Owns the Pi agent session inside the engine utility process: model runtime
 * (in-memory credentials only), MCP adapter wiring, per-website session
 * files, and the event bridge. ALL @earendil-works/* and pi-mcp-adapter
 * imports are confined to src/engine/ (RISKS R2).
 */
export class SessionRunner {
  private readonly agentDir: string
  private readonly workDir: string
  private readonly emit: SessionRunnerOptions['emit']

  private modelRuntime: ModelRuntime | null = null
  private modelConfig: ModelConfig | null = null
  private activeWebsiteId: string | null = null
  private session: AgentSession | null = null
  private unsubscribeEvents: (() => void) | null = null
  private promptInProgress = false

  constructor(options: SessionRunnerOptions) {
    this.agentDir = options.agentDir
    this.workDir = options.workDir
    this.emit = options.emit
  }

  get sessionReady(): boolean {
    return this.session !== null
  }

  /** Applies model config + access token; drops any active session. */
  async configure(req: ConfigureRequest): Promise<ConfigureResponse> {
    if (req.auth !== undefined) {
      this.setAccessToken(req.auth === null ? null : req.auth.accessToken)
    }
    if (req.model !== undefined) {
      this.modelConfig = req.model === null ? null : sanitizeModelConfig(req.model)
      this.closeSession()
      // Apply the key to the in-memory runtime right away so listModels can
      // resolve availability before a session exists.
      if (this.modelConfig?.apiKey && isBuiltinProvider(this.modelConfig.provider)) {
        const runtime = await this.ensureModelRuntime()
        await runtime.setRuntimeApiKey(this.modelConfig.provider, this.modelConfig.apiKey)
      }
    }
    return { ok: true, sessionReady: this.sessionReady }
  }

  setAccessToken(accessToken: string | null): void {
    if (accessToken === null) {
      delete process.env[ACCESS_TOKEN_ENV]
    } else {
      process.env[ACCESS_TOKEN_ENV] = accessToken
    }
  }

  async openSession(req: OpenSessionRequest): Promise<OpenSessionResponse> {
    if (!isSafeSegment(req.websiteId)) {
      throw new Error('websiteId must be a short slug (letters, digits, dash)')
    }
    this.closeSession()
    const cwd = await this.websiteWorkDir(req.websiteId)
    const sessionManager = await this.sessionManagerFor(req, cwd)
    const session = await this.buildSession(req.websiteId, cwd, sessionManager)
    this.session = session
    this.activeWebsiteId = req.websiteId
    this.unsubscribeEvents = session.subscribe((event) => {
      for (const mapped of mapSessionEvents(event)) this.emit(mapped)
    })
    this.emit({ type: 'session', sessionId: session.sessionId, websiteId: req.websiteId })
    this.emitHistory(session, req.websiteId)
    return { sessionId: session.sessionId }
  }

  /** Lists stored conversations (pi session files) for a website scope. */
  async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    if (!isSafeSegment(req.websiteId)) {
      throw new Error('websiteId must be a short slug (letters, digits, dash)')
    }
    const cwd = join(this.workDir, req.websiteId)
    const infos = await SessionManager.list(cwd)
    const conversations = infos
      .map(toConversationSummary)
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
      .sort((a, b) => b.modified.localeCompare(a.modified))
    return { conversations }
  }

  /** Direct read-only MCP call for the site picker (see DECISIONS D15). */
  async listWebsites(): Promise<ListWebsitesResponse> {
    return fetchWebsites()
  }

  prompt(req: PromptRequest): { accepted: boolean } {
    const session = this.requireSession()
    if (this.promptInProgress || session.isStreaming) {
      throw new Error('Agent is busy — abort first or wait for it to finish.')
    }
    const text = req.text.trim()
    if (text.length === 0) throw new Error('Empty prompt.')
    this.promptInProgress = true
    void session
      .prompt(text)
      .catch((err: unknown) => {
        this.emit({ type: 'error', message: errorMessage(err) })
      })
      .finally(() => {
        this.promptInProgress = false
      })
    return { accepted: true }
  }

  async steer(req: SteerRequest): Promise<{ accepted: boolean }> {
    const session = this.requireSession()
    await session.steer(req.text)
    return { accepted: true }
  }

  async abort(): Promise<{ aborted: boolean }> {
    const session = this.requireSession()
    await session.abort()
    return { aborted: true }
  }

  async listModels(provider: string): Promise<ModelListResponse> {
    if (!isModelProvider(provider)) throw new Error('unknown provider')
    if (provider === 'custom') return { models: [] }
    const runtime = await this.ensureModelRuntime()
    const models = await runtime.getAvailable()
    const options: ModelOption[] = []
    for (const model of models) {
      if (model.provider !== provider) continue
      options.push({
        provider,
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        reasoning: model.reasoning === true,
      })
    }
    options.sort((a, b) => a.id.localeCompare(b.id))
    return { models: options }
  }

  dispose(): void {
    this.closeSession()
  }

  /* --------------------------------------------------------------------- */

  private closeSession(): void {
    this.unsubscribeEvents?.()
    this.unsubscribeEvents = null
    const session = this.session
    this.session = null
    this.activeWebsiteId = null
    if (session) {
      try {
        session.dispose()
      } catch {
        // Best-effort teardown; the utility process exit is the real barrier.
      }
    }
  }

  private requireSession(): AgentSession {
    if (!this.session) throw new Error('No session open — connect a model first.')
    return this.session
  }

  private async ensureModelRuntime(): Promise<ModelRuntime> {
    if (!this.modelRuntime) {
      this.modelRuntime = await ModelRuntime.create({
        // Keys live in memory only — main holds them in safeStorage and
        // pushes them over the MessagePort. Nothing is ever written to
        // auth.json (and PI_CODING_AGENT_DIR keeps defaults off ~/.pi).
        credentials: new InMemoryCredentialStore(),
      })
    }
    return this.modelRuntime
  }

  private async buildSession(
    websiteId: string,
    cwd: string,
    sessionManager: SessionManager,
  ): Promise<AgentSession> {
    const config = this.modelConfig
    if (!config?.modelId) throw new Error('No model configured — connect a model first.')

    const runtime = await this.ensureModelRuntime()
    const model = await this.resolveModel(runtime, config)

    await syncBundledSkills(this.agentDir)

    const extensionFactories: ExtensionFactory[] = [
      createMcpAdapter({ config: buildMcpAdapterConfig() }),
    ]
    if (config.provider === 'custom') {
      extensionFactories.push(customProviderExtension(config))
    }

    const settingsManager = SettingsManager.inMemory()

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      settingsManager,
      systemPromptOverride: () => buildSystemPrompt(),
      // Deterministic context: never pick up ambient AGENTS.md files.
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      extensionFactories,
    })
    await loader.reload()

    const { session } = await createAgentSession({
      cwd,
      agentDir: this.agentDir,
      model,
      modelRuntime: runtime,
      tools: ['read', 'grep'],
      sessionManager,
      settingsManager,
      resourceLoader: loader,
    })
    return session
  }

  /**
   * Conversation selection (DECISIONS D15): `fresh` → brand-new session,
   * `sessionPath` → switch to that stored conversation (must live inside the
   * website's work directory), default → resume the most recent conversation
   * (first open for a site creates one).
   */
  private async sessionManagerFor(req: OpenSessionRequest, cwd: string): Promise<SessionManager> {
    if (req.fresh === true) return SessionManager.create(cwd)
    if (req.sessionPath !== undefined) {
      if (!isPathInside(cwd, req.sessionPath)) {
        throw new Error('sessionPath must be a stored conversation inside this website scope')
      }
      return SessionManager.open(req.sessionPath, undefined, cwd)
    }
    const existing = await SessionManager.list(cwd)
    if (existing.length === 0) return SessionManager.create(cwd)
    return SessionManager.continueRecent(cwd)
  }

  /** Replays the stored transcript into the renderer after (re)opening. */
  private emitHistory(session: AgentSession, websiteId: string): void {
    const history = mapHistoryMessages(session.sessionId, websiteId, session.messages)
    if (history.messages.length > 0) {
      this.emit(history)
    }
  }

  private async resolveModel(runtime: ModelRuntime, config: ModelConfig): Promise<Model<Api>> {
    const modelId = config.modelId
    if (!modelId) throw new Error('No model id configured.')
    if (isBuiltinProvider(config.provider)) {
      if (config.apiKey) {
        await runtime.setRuntimeApiKey(config.provider, config.apiKey)
      }
      const model = runtime.getModel(config.provider, modelId)
      if (!model) {
        throw new Error(`Unknown model "${modelId}" for provider ${config.provider}.`)
      }
      return model
    }
    // custom: model object is constructed; the provider impl is registered by
    // the inline extension factory (pi.registerProvider) at session build.
    if (!config.baseUrl) throw new Error('Custom provider requires a base URL.')
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: CUSTOM_PROVIDER_ID,
      baseUrl: config.baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_192,
    }
  }

  private async websiteWorkDir(websiteId: string): Promise<string> {
    const dir = join(this.workDir, websiteId)
    await mkdir(dir, { recursive: true })
    return dir
  }
}

export const CUSTOM_PROVIDER_ID = 'pw-custom'

function sanitizeModelConfig(raw: ModelConfig): ModelConfig {
  const config: ModelConfig = { provider: raw.provider }
  if (typeof raw.modelId === 'string' && raw.modelId.trim() !== '') {
    config.modelId = raw.modelId.trim()
  }
  if (typeof raw.baseUrl === 'string' && raw.baseUrl.trim() !== '') {
    config.baseUrl = raw.baseUrl.trim()
  }
  if (typeof raw.apiKey === 'string' && raw.apiKey.trim() !== '') {
    config.apiKey = raw.apiKey
  }
  return config
}

function isSafeSegment(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
}

/** Pure path guard: the stored-conversation handle must resolve inside the site's work dir. */
export function isPathInside(dir: string, candidate: string): boolean {
  const base = resolve(dir)
  const target = resolve(candidate)
  if (target === base) return false
  return target.startsWith(base + sep)
}

/** Pure: pi SessionInfo → renderer-safe ConversationSummary. */
export function toConversationSummary(info: unknown): ConversationSummary | null {
  if (typeof info !== 'object' || info === null) return null
  const record = info as Record<string, unknown>
  const path = typeof record.path === 'string' && record.path !== '' ? record.path : null
  const id = typeof record.id === 'string' && record.id !== '' ? record.id : null
  if (!path || !id) return null
  const first = typeof record.firstMessage === 'string' ? record.firstMessage : ''
  const modified = toIsoTimestamp(record.modified)
  if (!modified) return null
  const messageCount = typeof record.messageCount === 'number' ? record.messageCount : 0
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : undefined
  const summary: ConversationSummary = {
    path,
    id,
    firstMessage: first.length > 200 ? `${first.slice(0, 200)}…` : first,
    modified,
    messageCount,
    ...(name !== undefined ? { name } : {}),
  }
  return summary
}

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    const iso = value.toISOString()
    return Number.isNaN(Date.parse(iso)) ? null : iso
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value
  return null
}

/**
 * Registers the user's custom OpenAI-compatible endpoint as a pi provider so
 * the engine can stream from it with the key held in memory only.
 */
function customProviderExtension(config: ModelConfig): ExtensionFactory {
  const modelId = config.modelId
  const baseUrl = config.baseUrl
  if (!modelId || !baseUrl) {
    throw new Error('Custom provider requires a model id and base URL.')
  }
  return (pi: ExtensionAPI) => {
    pi.registerProvider(CUSTOM_PROVIDER_ID, {
      name: 'Custom (OpenAI-compatible)',
      baseUrl,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      api: 'openai-completions',
      models: [
        {
          id: modelId,
          name: modelId,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 8_192,
        },
      ],
    })
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
