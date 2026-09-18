import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import {
  HISTORY_MAX_MESSAGES,
  HISTORY_TEXT_MAX_CHARS,
  TOOL_OUTPUT_PREVIEW_MAX_CHARS,
  type EngineEvent,
  type HistoryMessage,
  type HistoryToolCall,
} from '../shared/engine-events'

/**
 * Pure Pi-session-event → renderer-envelope mapping. The engine forwards
 * ONLY these envelopes to main; everything else stays in the engine. Kept
 * defensive on purpose: pi's event payloads may gain fields or shapes across
 * versions, and unknown shapes degrade to a `status` line instead of
 * crashing the bridge.
 */

export function truncatePreview(text: string, max = TOOL_OUTPUT_PREVIEW_MAX_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stringAt(value: Record<string, unknown>, key: string): string | undefined {
  const v = value[key]
  return typeof v === 'string' ? v : undefined
}

function describeUnknown(value: unknown): string {
  if (typeof value === 'string') return truncatePreview(value)
  try {
    return truncatePreview(JSON.stringify(value) ?? String(value))
  } catch {
    return String(value)
  }
}

export function mapSessionEvent(raw: AgentSessionEvent): EngineEvent | EngineEvent[] | null {
  const event = asRecord(raw)
  switch (event.type) {
    case 'message_update': {
      const inner = asRecord(event.assistantMessageEvent)
      const innerType = inner.type
      if (innerType === 'text_delta' && typeof inner.delta === 'string') {
        return { type: 'text_delta', delta: inner.delta }
      }
      if (innerType === 'thinking_delta' && typeof inner.delta === 'string') {
        return { type: 'thinking_delta', delta: inner.delta }
      }
      return null
    }
    case 'agent_start':
      return { type: 'agent_start' }
    case 'agent_end':
      return { type: 'agent_end' }
    case 'turn_start':
      return { type: 'turn_start' }
    case 'turn_end':
      return { type: 'turn_end' }
    case 'tool_execution_start': {
      const name = stringAt(event, 'toolName') ?? 'unknown-tool'
      const callId = stringAt(event, 'toolCallId') ?? `${name}-${String(Date.now())}`
      return { type: 'tool_start', callId, name }
    }
    case 'tool_execution_end': {
      const name = stringAt(event, 'toolName') ?? 'unknown-tool'
      const callId = stringAt(event, 'toolCallId') ?? `${name}-${String(Date.now())}`
      const isError = event.isError === true
      const output = truncatePreview(describeUnknown(event.result ?? event.output ?? ''))
      return {
        type: 'tool_end',
        callId,
        name,
        isError,
        ...(output.length > 0 ? { outputPreview: output } : {}),
      }
    }
    case 'compaction_start':
      return { type: 'status', message: 'Compacting conversation context…' }
    case 'compaction_end':
      return { type: 'status', message: 'Context compacted.' }
    case 'auto_retry_start':
      return { type: 'status', message: 'Model call failed — retrying automatically…' }
    case 'auto_retry_end':
      return { type: 'status', message: 'Retry finished.' }
    case 'queue_update': {
      const steering = Array.isArray(event.steering) ? event.steering.length : 0
      const followUp = Array.isArray(event.followUp) ? event.followUp.length : 0
      return { type: 'status', message: `Queued messages: ${steering} steering, ${followUp} follow-up.` }
    }
    default:
      // Unknown event shapes must never break the bridge; surface a hint.
      return { type: 'status', message: `engine event: ${describeUnknown(event.type ?? raw)}` }
  }
}

export function mapSessionEvents(raw: AgentSessionEvent): EngineEvent[] {
  const mapped = mapSessionEvent(raw)
  if (mapped === null) return []
  return Array.isArray(mapped) ? mapped : [mapped]
}

/* ------------------------------------------------------------------------- */
/* History backfill — rebuilt transcript when a stored conversation opens.    */
/* ------------------------------------------------------------------------- */

/**
 * Structural view of pi's AgentMessage (role + content). Kept loose on
 * purpose: stored sessions may come from older pi versions, and unknown
 * shapes degrade to text previews instead of breaking the rebuild.
 */
export type HistorySourceMessage = Record<string, unknown>

/** Content part type tags seen in pi messages. */
const PART_TYPES = { text: 'text', thinking: 'thinking', toolCall: 'toolCall' } as const

export function mapHistoryMessages(
  sessionId: string,
  websiteId: string,
  raw: unknown,
): Extract<EngineEvent, { type: 'history' }> {
  return { type: 'history', sessionId, websiteId, messages: buildHistoryMessages(raw) }
}

/** Pure: AgentMessage[] → renderer-safe HistoryMessage[] (bounded, truncated). */
export function buildHistoryMessages(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return []
  const source = raw.slice(-HISTORY_MAX_MESSAGES) as HistorySourceMessage[]
  const out: HistoryMessage[] = []
  for (const message of source) {
    const role = stringAt(message, 'role')
    if (role === 'user') {
      out.push({ role: 'user', text: truncateText(joinUserText(message)) })
      continue
    }
    if (role === 'toolResult') {
      foldToolResult(out, message)
      continue
    }
    if (role === 'assistant') {
      out.push(buildAssistant(message))
      continue
    }
    // Unknown roles (custom entries, compaction markers…) are dropped.
  }
  return out
}

function buildAssistant(message: HistorySourceMessage): HistoryMessage {
  const content = Array.isArray(message.content) ? message.content : []
  let text = ''
  let thinking = ''
  const toolCalls: HistoryToolCall[] = []
  for (const part of content) {
    const record = asRecord(part)
    switch (record.type) {
      case PART_TYPES.text: {
        const value = stringAt(record, 'text')
        if (value) text += (text ? '\n\n' : '') + value
        break
      }
      case PART_TYPES.thinking: {
        const value = stringAt(record, 'thinking')
        if (value) thinking += (thinking ? '\n\n' : '') + value
        break
      }
      case PART_TYPES.toolCall: {
        const id = stringAt(record, 'id') ?? `call-${toolCalls.length}`
        toolCalls.push({ id, name: stringAt(record, 'name') ?? 'unknown-tool', isError: false })
        break
      }
      default:
        break
    }
  }
  const messageOut: HistoryMessage = { role: 'assistant', text: truncateText(text) }
  if (thinking) messageOut.thinking = truncateText(thinking)
  if (toolCalls.length > 0) messageOut.toolCalls = toolCalls
  return messageOut
}

/** Folds a toolResult message into the matching tool call on the nearest assistant message. */
function foldToolResult(out: HistoryMessage[], message: HistorySourceMessage): void {
  const callId = stringAt(message, 'toolCallId')
  const target = [...out].reverse().find((m) => m.toolCalls?.some((call) => call.id === callId))
  const call = target?.toolCalls?.find((c) => c.id === callId)
  if (!call) return
  call.isError = message.isError === true
  const content = Array.isArray(message.content) ? message.content : []
  const parts = content
    .map((part) => stringAt(asRecord(part), 'text') ?? '[non-text content]')
    .filter((part) => part.length > 0)
  const output = parts.join('\n')
  if (output.length > 0) call.outputPreview = truncatePreview(output)
}

function joinUserText(message: HistorySourceMessage): string {
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const record = asRecord(part)
      if (stringAt(record, 'type') === PART_TYPES.text) return stringAt(record, 'text') ?? ''
      return '[image]'
    })
    .filter((part) => part.length > 0)
    .join('\n\n')
}

function truncateText(text: string): string {
  if (text.length <= HISTORY_TEXT_MAX_CHARS) return text
  return `${text.slice(0, HISTORY_TEXT_MAX_CHARS)}… [truncated ${text.length - HISTORY_TEXT_MAX_CHARS} chars]`
}
