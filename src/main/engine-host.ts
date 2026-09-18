import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron'
import enginePath from '../engine/index?modulePath'
import type {
  AbortResponse,
  ConfigureRequest,
  ConfigureResponse,
  EngineInitPaths,
  EngineRequest,
  EngineResponse,
  EngineResponseKind,
  ListSessionsRequest,
  ListSessionsResponse,
  ListWebsitesResponse,
  ModelListResponse,
  ModelProvider,
  OpenSessionRequest,
  OpenSessionResponse,
  PingRequest,
  PongResponse,
  PromptRequest,
  PromptResponse,
  SteerRequest,
  SteerResponse,
  TokenUpdatedRequest,
} from '../shared/ipc'
import type { EngineEvent, EngineNotice } from '../shared/engine-events'
import { DEBUG_WEBSITE_ID } from '../shared/ipc'

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const
const STABLE_UPTIME_MS = 30_000

/** Control requests answer quickly; streaming runs surface as notices. */
const REQUEST_TIMEOUT_MS: Partial<Record<EngineRequest['kind'], number>> = {
  ping: 5_000,
  configure: 60_000,
  'token-updated': 5_000,
  'open-session': 60_000,
  prompt: 10_000,
  steer: 10_000,
  abort: 10_000,
  'list-models': 60_000,
  'list-sessions': 30_000,
  'list-websites': 60_000,
}
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Owns the engine utility process: spawn, MessageChannelMain wiring,
 * requestId correlation, per-kind timeouts, streaming-notice fan-out, and
 * crash restart with exponential backoff (re-applying configure + session
 * so a crash never strands the renderer without a usable engine).
 */
export class EngineHost {
  private child: UtilityProcess | null = null
  private port: MessagePortMain | null = null
  private readonly pending = new Map<string, (res: EngineResponse) => void>()
  private requestSeq = 0
  private restartAttempt = 0
  private startedAt = 0
  private quitting = false

  /** Last applied state, replayed after a crash restart. */
  private lastConfigure: ConfigureRequest | null = null
  private lastSession: OpenSessionRequest | null = null

  private readonly eventListeners = new Set<(event: EngineEvent) => void>()

  start(paths: EngineInitPaths): void {
    this.quitting = false
    this.startedAt = Date.now()
    this.paths = paths

    const child = utilityProcess.fork(enginePath, [], { serviceName: 'pw-engine' })
    this.child = child
    child.on('spawn', () => console.log(`[pw] engine spawned (pid ${child.pid})`))

    const { port1, port2 } = new MessageChannelMain()
    this.port = port2
    child.postMessage({ type: 'init', paths }, [port1])

    port2.on('message', (e) => this.onEngineMessage(e.data))
    port2.start()

    child.on('exit', (code) => this.onEngineExit(code))
  }

  private paths: EngineInitPaths = { agentDir: '', workDir: '' }

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  async ping(req: PingRequest): Promise<PongResponse> {
    const res = await this.request('ping', req)
    return unwrap(res, 'pong').payload
  }

  async configure(req: ConfigureRequest): Promise<ConfigureResponse> {
    const res = await this.request('configure', req)
    const payload = unwrap(res, 'configured').payload
    this.lastConfigure = req
    return payload
  }

  async pushToken(req: TokenUpdatedRequest): Promise<void> {
    await this.request('token-updated', req)
    // Keep the replay config in sync for crash restarts.
    this.lastConfigure = { ...this.lastConfigure, auth: req.accessToken === null ? null : { accessToken: req.accessToken } }
  }

  async openSession(req: OpenSessionRequest): Promise<OpenSessionResponse> {
    const res = await this.request('open-session', req)
    const payload = unwrap(res, 'session').payload
    this.lastSession = req
    return payload
  }

  /** Re-opens the last session scope; falls back to the debug scope (after configure or crash restart). */
  async reopenLastSession(): Promise<OpenSessionResponse | null> {
    if (this.lastSession) return this.openSession(this.lastSession)
    return this.openSession({ websiteId: DEBUG_WEBSITE_ID })
  }

  async prompt(req: PromptRequest): Promise<PromptResponse> {
    const res = await this.request('prompt', req)
    return unwrap(res, 'prompt').payload
  }

  async steer(req: SteerRequest): Promise<SteerResponse> {
    const res = await this.request('steer', req)
    return unwrap(res, 'steer').payload
  }

  async abort(): Promise<AbortResponse> {
    const res = await this.request('abort', null)
    return unwrap(res, 'abort').payload
  }

  async listModels(provider: ModelProvider): Promise<ModelListResponse> {
    const res = await this.request('list-models', { provider })
    return unwrap(res, 'models').payload
  }

  async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    const res = await this.request('list-sessions', req)
    return unwrap(res, 'sessions').payload
  }

  async listWebsites(): Promise<ListWebsitesResponse> {
    const res = await this.request('list-websites', null)
    return unwrap(res, 'websites').payload
  }

  stop(): void {
    this.quitting = true
    this.rejectAllPending('engine shutting down')
    this.child?.kill()
    this.child = null
    this.port = null
  }

  private request<K extends EngineRequest['kind']>(
    kind: K,
    payload: Extract<EngineRequest, { kind: K }>['payload'],
  ): Promise<EngineResponse> {
    const port = this.port
    if (!port) return Promise.reject(new Error('engine not running'))
    const requestId = `${kind}-${++this.requestSeq}`
    const message = { kind, requestId, payload } as EngineRequest
    const timeoutMs = REQUEST_TIMEOUT_MS[kind] ?? DEFAULT_TIMEOUT_MS
    return new Promise<EngineResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('engine request timeout'))
      }, timeoutMs)
      this.pending.set(requestId, (res) => {
        clearTimeout(timer)
        resolve(res)
      })
      port.postMessage(message)
    })
  }

  private onEngineMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      console.error('[pw] engine sent malformed envelope')
      return
    }
    const kind = (data as { kind?: unknown }).kind
    if (kind === 'ready') {
      console.log('[pw] engine ready')
      return
    }
    if (kind === 'event') {
      const event = (data as { event?: unknown }).event
      if (typeof event === 'object' && event !== null) {
        for (const listener of this.eventListeners) listener(event as EngineEvent)
      }
      return
    }
    const res = data as EngineResponse | null
    if (res === null || typeof res.requestId !== 'string') {
      console.error('[pw] engine sent malformed envelope')
      return
    }
    const settle = this.pending.get(res.requestId)
    if (!settle) {
      console.error(`[pw] engine response for unknown request ${res.requestId}`)
      return
    }
    this.pending.delete(res.requestId)
    settle(res)
  }

  private onEngineExit(code: number): void {
    this.rejectAllPending('engine exited')
    this.port = null
    this.child = null
    if (this.quitting) return
    console.error(`[pw] engine exited unexpectedly (code ${code}) — restarting`)
    if (Date.now() - this.startedAt > STABLE_UPTIME_MS) this.restartAttempt = 0
    const delay = BACKOFF_MS[Math.min(this.restartAttempt, BACKOFF_MS.length - 1)] ?? 15_000
    this.restartAttempt++
    setTimeout(() => {
      if (this.quitting) return
      this.start(this.paths)
      void this.replayState()
    }, delay)
  }

  /** Re-applies configure + open-session after a crash restart. */
  private async replayState(): Promise<void> {
    try {
      if (this.lastConfigure) await this.configure(this.lastConfigure)
      if (this.lastSession) await this.openSession(this.lastSession)
    } catch (err) {
      console.error(`[pw] engine state replay failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, settle] of this.pending) {
      settle({ kind: 'error', requestId: id, message: reason })
      this.pending.delete(id)
    }
  }
}

export type { EngineResponseKind, EngineNotice }

/** Narrows an engine response to the expected kind; maps error envelopes. */
function unwrap<K extends EngineResponse['kind']>(
  res: EngineResponse,
  kind: K,
): Extract<EngineResponse, { kind: K }> {
  if (res.kind === 'error') throw new Error(`engine error: ${res.message}`)
  if (res.kind !== kind) throw new Error(`engine error: unexpected response kind ${res.kind}`)
  return res as Extract<EngineResponse, { kind: K }>
}
