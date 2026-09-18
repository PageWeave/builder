import type { ModelProvider } from './ipc'

/**
 * Renderer-safe event envelopes produced by the engine (Pi session events,
 * mapped in src/engine/events.ts) and forwarded main → renderer over
 * IpcChannel.engineEvent. Everything here must be secret-free: no tokens, no
 * API keys, no raw provider payloads.
 */

export type EngineEvent =
  | { type: 'session'; sessionId: string; websiteId: string }
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_start'; callId: string; name: string }
  | { type: 'tool_end'; callId: string; name: string; isError: boolean; outputPreview?: string }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }

export const ENGINE_EVENT_TYPES = [
  'session',
  'agent_start',
  'agent_end',
  'turn_start',
  'turn_end',
  'text_delta',
  'thinking_delta',
  'tool_start',
  'tool_end',
  'status',
  'error',
] as const
export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number]

/** Messages the engine pushes to main over the MessagePort (no requestId). */
export type EngineNotice =
  | { kind: 'ready' }
  | { kind: 'event'; event: EngineEvent }

export const ENGINE_NOTICE_KINDS = ['ready', 'event'] as const
export type EngineNoticeKind = (typeof ENGINE_NOTICE_KINDS)[number]

/** A selectable model entry, derived from the engine's runtime catalogs. */
export interface ModelOption {
  provider: ModelProvider
  id: string
  name: string
  contextWindow: number
  reasoning: boolean
}

/** Cap the per-tool output preview forwarded to the renderer. */
export const TOOL_OUTPUT_PREVIEW_MAX_CHARS = 2_000
