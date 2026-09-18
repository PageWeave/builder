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
  | {
      type: 'history'
      sessionId: string
      websiteId: string
      messages: HistoryMessage[]
    }

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
  'history',
] as const
export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number]

/** A tool call (plus its folded-in result) inside a history message. */
export interface HistoryToolCall {
  id: string
  name: string
  isError: boolean
  outputPreview?: string
}

/**
 * One renderer-safe transcript message rebuilt from a stored pi session when
 * a conversation is (re)opened. Text is truncated defensively; tool results
 * are folded into the assistant tool call that produced them.
 */
export interface HistoryMessage {
  role: 'user' | 'assistant'
  text: string
  thinking?: string
  toolCalls?: HistoryToolCall[]
}

/** History caps — conversations can be long; the rebuild stays bounded. */
export const HISTORY_MAX_MESSAGES = 500
export const HISTORY_TEXT_MAX_CHARS = 20_000

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
