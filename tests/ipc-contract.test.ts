import { describe, expect, it } from 'vitest'
import { handlePing, isPingRequest } from '../src/engine/ping'
import {
  ENGINE_REQUEST_KINDS,
  ENGINE_RESPONSE_KINDS,
  IpcChannel,
  type EngineRequest,
  type EngineResponse,
} from '../src/shared/ipc'

describe('IPC channel contract', () => {
  it('channel names are unique and namespaced', () => {
    const values = Object.values(IpcChannel)
    expect(values.length).toBeGreaterThan(0)
    expect(new Set(values).size).toBe(values.length)
    for (const v of values) expect(v).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })

  it('engine envelope kinds are paired and exhaustive', () => {
    expect(ENGINE_REQUEST_KINDS).toEqual(['ping'])
    expect(ENGINE_RESPONSE_KINDS).toEqual(['pong', 'error'])
  })

  it('ping envelope survives JSON round trip (structured-clone semantics)', () => {
    const req: EngineRequest = { kind: 'ping', requestId: 't1', payload: { message: 'm', sentAt: 123 } }
    const decoded = JSON.parse(JSON.stringify(req)) as EngineRequest
    expect(decoded).toEqual(req)

    const res: EngineResponse = { kind: 'pong', requestId: 't1', payload: handlePing(req.payload, 456) }
    const decodedRes = JSON.parse(JSON.stringify(res)) as EngineResponse
    expect(decodedRes.kind).toBe('pong')
    expect(decodedRes.kind === 'pong' && decodedRes.payload.echo).toBe('m')
  })
})

describe('engine ping handler (pure)', () => {
  it('echoes message with engine source and timestamps', () => {
    expect(handlePing({ message: 'hi', sentAt: 100 }, 250)).toEqual({
      echo: 'hi',
      sentAt: 100,
      pongedAt: 250,
      source: 'engine',
    })
  })

  it('validates ping payloads before handling', () => {
    const valid: unknown = { message: 'x', sentAt: 1 }
    expect(isPingRequest(valid)).toBe(true)
    for (const bad of [null, 'x', 42, {}, { message: 1, sentAt: 1 }, { message: 'x' }, { sentAt: 1 }]) {
      expect(isPingRequest(bad)).toBe(false)
    }
  })
})
