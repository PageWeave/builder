import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import {
  TOOL_OUTPUT_PREVIEW_MAX_CHARS,
  type EngineEvent,
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
