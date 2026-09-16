import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron'
import enginePath from '../engine/index?modulePath'
import type { EngineRequest, EngineResponse, EngineResponseKind, PingRequest, PongResponse } from '../shared/ipc'

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const
const STABLE_UPTIME_MS = 30_000
const REQUEST_TIMEOUT_MS = 5_000

/**
 * Owns the engine utility process: spawn, MessageChannelMain wiring,
 * requestId correlation, and crash restart with exponential backoff.
 */
export class EngineHost {
  private child: UtilityProcess | null = null
  private port: MessagePortMain | null = null
  private readonly pending = new Map<string, (res: EngineResponse) => void>()
  private requestSeq = 0
  private restartAttempt = 0
  private startedAt = 0
  private quitting = false

  start(): void {
    this.quitting = false
    this.startedAt = Date.now()

    const child = utilityProcess.fork(enginePath, [], { serviceName: 'pw-engine' })
    this.child = child
    child.on('spawn', () => console.log(`[pw] engine spawned (pid ${child.pid})`))

    const { port1, port2 } = new MessageChannelMain()
    this.port = port2
    child.postMessage({ type: 'init' }, [port1])

    port2.on('message', (e) => this.onEngineMessage(e.data))
    port2.start()

    child.on('exit', (code) => this.onEngineExit(code))
  }

  async ping(req: PingRequest): Promise<PongResponse> {
    const requestId = `ping-${++this.requestSeq}`
    const message: EngineRequest = { kind: 'ping', requestId, payload: req }
    const res = await this.request(message, requestId)
    if (res.kind === 'pong') return res.payload
    throw new Error(`engine error: ${res.message}`)
  }

  stop(): void {
    this.quitting = true
    this.rejectAllPending('engine shutting down')
    this.child?.kill()
    this.child = null
    this.port = null
  }

  private request(message: EngineRequest, requestId: string): Promise<EngineResponse> {
    const port = this.port
    if (!port) return Promise.reject(new Error('engine not running'))
    return new Promise<EngineResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('engine request timeout'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, (res) => {
        clearTimeout(timer)
        resolve(res)
      })
      port.postMessage(message)
    })
  }

  private onEngineMessage(data: unknown): void {
    const res = data as EngineResponse | null
    if (typeof res !== 'object' || res === null || typeof res.requestId !== 'string') {
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
      if (!this.quitting) this.start()
    }, delay)
  }

  private rejectAllPending(reason: string): void {
    for (const [id, settle] of this.pending) {
      settle({ kind: 'error', requestId: id, message: reason })
      this.pending.delete(id)
    }
  }
}

export type { EngineResponseKind }
