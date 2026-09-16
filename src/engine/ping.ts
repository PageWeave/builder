import type { PingRequest, PongResponse } from '../shared/ipc'

/**
 * Pure engine-side ping handler — kept free of any Electron/channel API so
 * tests can run it directly (see tests/ipc-contract.test.ts).
 */
export function handlePing(req: PingRequest, now: number): PongResponse {
  return { echo: req.message, sentAt: req.sentAt, pongedAt: now, source: 'engine' }
}

export function isPingRequest(value: unknown): value is PingRequest {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.message === 'string' && typeof v.sentAt === 'number'
}
