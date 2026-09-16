import type { EngineRequest, EngineResponse } from '../shared/ipc'
import { handlePing, isPingRequest } from './ping'

/**
 * Engine entry — runs inside an Electron utility process as plain Node.
 *
 * Lifecycle: main forks this module (?modulePath) and hands us one half of a
 * MessageChannelMain pair via an init message on process.parentPort. All
 * subsequent traffic flows through that port using the EngineRequest /
 * EngineResponse envelopes from src/shared/ipc.ts. No `electron` imports here
 * (isolation rule, see .opencode/skills/pi-engine/SKILL.md).
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

function respond(port: PortLike, res: EngineResponse): void {
  port.postMessage(res)
}

parentPort.on('message', (e) => {
  const port = e.ports?.[0]
  if (!port) {
    console.error('[engine] init message carried no port')
    return
  }

  port.on('message', (ev) => {
    const req = ev.data as EngineRequest
    if (typeof req !== 'object' || req === null || typeof req.requestId !== 'string') {
      console.error('[engine] malformed envelope')
      return
    }
    switch (req.kind) {
      case 'ping': {
        if (!isPingRequest(req.payload)) {
          respond(port, { kind: 'error', requestId: req.requestId, message: 'invalid ping payload' })
          return
        }
        respond(port, { kind: 'pong', requestId: req.requestId, payload: handlePing(req.payload, Date.now()) })
        return
      }
      default: {
        respond(port, { kind: 'error', requestId: req.requestId, message: 'unknown request kind' })
      }
    }
  })
  port.start()
})
