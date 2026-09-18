import type { EngineNotice } from '../shared/engine-events'
import type { EngineRequest, EngineResponse } from '../shared/ipc'
import { isPingRequest } from './ping'
import { ACCESS_TOKEN_ENV } from './mcp-config'
import { SessionRunner, errorMessage } from './session'

/**
 * Engine entry — runs inside an Electron utility process as plain Node.
 *
 * Lifecycle: main forks this module (?modulePath) and hands us one half of a
 * MessageChannelMain pair via an init message on process.parentPort. All
 * subsequent traffic flows through that port using the EngineRequest /
 * EngineResponse envelopes and the one-way EngineNotice stream from
 * src/shared/. No `electron` imports here (isolation rule — all
 * @earendil-works/* and pi-mcp-adapter imports live behind src/engine/ and
 * are owned by SessionRunner).
 */

interface PortLike {
  on(event: 'message', listener: (e: { data: unknown }) => void): void
  postMessage(value: unknown): void
  start(): void
}

interface ParentPortLike {
  on(event: 'message', listener: (e: { data: unknown; ports?: PortLike[] }) => void): void
  postMessage(value: unknown): void
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort

if (!parentPort) {
  console.error('[engine] no parentPort — must run via utilityProcess.fork')
  process.exit(1)
}

const portRef: { current: PortLike | null } = { current: null }

function respond(port: PortLike, res: EngineResponse): void {
  port.postMessage(res)
}

function notice(notice: EngineNotice): void {
  portRef.current?.postMessage(notice)
}

/**
 * App-managed pi environment. Main passes absolute userData paths in the
 * init message so the engine never touches ~/.pi (PI_CODING_AGENT_DIR is
 * the supported override for pi's agent dir: sessions, mcp cache, catalogs).
 */
interface EnginePaths {
  agentDir: string
  workDir: string
}

const runnerRef: { current: SessionRunner | null } = { current: null }

function ensureRunner(paths: EnginePaths): SessionRunner {
  if (!runnerRef.current) {
    process.env.PI_CODING_AGENT_DIR = paths.agentDir
    runnerRef.current = new SessionRunner({
      agentDir: paths.agentDir,
      workDir: paths.workDir,
      emit: (event) => notice({ kind: 'event', event }),
    })
  }
  return runnerRef.current
}

async function handleRequest(port: PortLike, req: EngineRequest, paths: EnginePaths): Promise<void> {
  switch (req.kind) {
    case 'ping': {
      if (!isPingRequest(req.payload)) {
        respond(port, { kind: 'error', requestId: req.requestId, message: 'invalid ping payload' })
        return
      }
      const { handlePing } = await import('./ping')
      respond(port, { kind: 'pong', requestId: req.requestId, payload: handlePing(req.payload, Date.now()) })
      return
    }
    case 'configure': {
      const runner = ensureRunner(paths)
      const result = await runner.configure(req.payload)
      respond(port, { kind: 'configured', requestId: req.requestId, payload: result })
      return
    }
    case 'token-updated': {
      const runner = runnerRef.current
      const accessToken = req.payload?.accessToken ?? null
      if (runner) runner.setAccessToken(accessToken)
      else if (accessToken) process.env[ACCESS_TOKEN_ENV] = accessToken
      respond(port, { kind: 'token-updated', requestId: req.requestId, payload: { ok: true } })
      return
    }
    case 'open-session': {
      const runner = ensureRunner(paths)
      const result = await runner.openSession(req.payload)
      respond(port, { kind: 'session', requestId: req.requestId, payload: result })
      return
    }
    case 'prompt': {
      const runner = runnerRef.current
      if (!runner) throw new Error('Engine not configured yet.')
      const result = runner.prompt(req.payload)
      respond(port, { kind: 'prompt', requestId: req.requestId, payload: result })
      return
    }
    case 'steer': {
      const runner = runnerRef.current
      if (!runner) throw new Error('Engine not configured yet.')
      const result = await runner.steer(req.payload)
      respond(port, { kind: 'steer', requestId: req.requestId, payload: result })
      return
    }
    case 'abort': {
      const runner = runnerRef.current
      if (!runner) throw new Error('Engine not configured yet.')
      const result = await runner.abort()
      respond(port, { kind: 'abort', requestId: req.requestId, payload: result })
      return
    }
    case 'list-models': {
      const runner = ensureRunner(paths)
      const result = await runner.listModels(req.payload.provider)
      respond(port, { kind: 'models', requestId: req.requestId, payload: result })
      return
    }
    case 'list-sessions': {
      const runner = ensureRunner(paths)
      const result = await runner.listSessions(req.payload)
      respond(port, { kind: 'sessions', requestId: req.requestId, payload: result })
      return
    }
    case 'list-websites': {
      const runner = ensureRunner(paths)
      const result = await runner.listWebsites()
      respond(port, { kind: 'websites', requestId: req.requestId, payload: result })
      return
    }
    default: {
      respond(port, {
        kind: 'error',
        requestId: (req as { requestId?: string }).requestId ?? 'unknown',
        message: 'unknown request kind',
      })
    }
  }
}

parentPort.on('message', (e) => {
  const port = e.ports?.[0]
  if (!port) {
    console.error('[engine] init message carried no port')
    return
  }
  portRef.current = port

  // Main → engine paths arrive on the init envelope (before any request).
  const initPaths = readPaths(e.data)
  if (!initPaths) {
    console.error('[engine] init message carried no engine paths')
    return
  }

  port.on('message', (ev) => {
    const req = ev.data as EngineRequest
    if (typeof req !== 'object' || req === null || typeof req.requestId !== 'string') {
      console.error('[engine] malformed envelope')
      return
    }
    void handleRequest(port, req, initPaths).catch((err: unknown) => {
      respond(port, { kind: 'error', requestId: req.requestId, message: errorMessage(err) })
    })
  })
  port.start()

  notice({ kind: 'ready' })
})

function readPaths(data: unknown): EnginePaths | null {
  if (typeof data !== 'object' || data === null) return null
  const paths = (data as { paths?: unknown }).paths
  if (typeof paths !== 'object' || paths === null) return null
  const agentDir = (paths as { agentDir?: unknown }).agentDir
  const workDir = (paths as { workDir?: unknown }).workDir
  if (typeof agentDir !== 'string' || typeof workDir !== 'string') return null
  return { agentDir, workDir }
}
