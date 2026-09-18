import { describe, expect, it } from 'vitest'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { ENGINE_EVENT_TYPES, TOOL_OUTPUT_PREVIEW_MAX_CHARS, type EngineEvent } from '../src/shared/engine-events'
import { mapSessionEvent, mapSessionEvents, truncatePreview } from '../src/engine/events'

function asEvent(raw: unknown): AgentSessionEvent {
  return raw as AgentSessionEvent
}

describe('truncatePreview', () => {
  it('passes short text through unchanged', () => {
    expect(truncatePreview('hello')).toBe('hello')
  })

  it('truncates with a char-count marker', () => {
    const long = 'x'.repeat(TOOL_OUTPUT_PREVIEW_MAX_CHARS + 500)
    const out = truncatePreview(long)
    expect(out.length).toBeLessThan(long.length)
    expect(out).toContain('[truncated 500 chars]')
  })
})

describe('mapSessionEvents (pure Pi → envelope mapping)', () => {
  it('maps text_delta and thinking_delta', () => {
    expect(mapSessionEvents(asEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hi' } }))).toEqual([
      { type: 'text_delta', delta: 'hi' },
    ])
    expect(
      mapSessionEvents(asEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hm' } })),
    ).toEqual([{ type: 'thinking_delta', delta: 'hm' }])
  })

  it('drops non-delta message_update shapes (block starts/ends)', () => {
    expect(mapSessionEvents(asEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_start' } }))).toEqual([])
  })

  it('maps agent/turn lifecycle events', () => {
    expect(mapSessionEvents(asEvent({ type: 'agent_start' }))).toEqual([{ type: 'agent_start' }])
    expect(mapSessionEvents(asEvent({ type: 'agent_end' }))).toEqual([{ type: 'agent_end' }])
    expect(mapSessionEvents(asEvent({ type: 'turn_start' }))).toEqual([{ type: 'turn_start' }])
    expect(mapSessionEvents(asEvent({ type: 'turn_end' }))).toEqual([{ type: 'turn_end' }])
  })

  it('maps tool execution start/end with stable ids and truncated previews', () => {
    const start = mapSessionEvents(asEvent({ type: 'tool_execution_start', toolName: 'pageweave_get_page', toolCallId: 'c1' }))
    expect(start).toEqual([{ type: 'tool_start', callId: 'c1', name: 'pageweave_get_page' }])

    const end = mapSessionEvents(
      asEvent({ type: 'tool_execution_end', toolName: 'pageweave_get_page', toolCallId: 'c1', isError: false, result: 'ok' }),
    )
    expect(end).toEqual([
      { type: 'tool_end', callId: 'c1', name: 'pageweave_get_page', isError: false, outputPreview: 'ok' },
    ])

    const big = mapSessionEvents(
      asEvent({
        type: 'tool_execution_end',
        toolName: 't',
        toolCallId: 'c2',
        isError: true,
        result: 'y'.repeat(TOOL_OUTPUT_PREVIEW_MAX_CHARS * 3),
      }),
    )
    const endEvent = big[0]
    expect(endEvent?.type).toBe('tool_end')
    if (endEvent?.type === 'tool_end') {
      expect(endEvent.isError).toBe(true)
      expect(endEvent.outputPreview?.length).toBeLessThan(TOOL_OUTPUT_PREVIEW_MAX_CHARS * 3)
    }
  })

  it('maps compaction and retry lifecycle to status lines', () => {
    expect(mapSessionEvents(asEvent({ type: 'compaction_start' }))[0]?.type).toBe('status')
    expect(mapSessionEvents(asEvent({ type: 'compaction_end' }))[0]?.type).toBe('status')
    expect(mapSessionEvents(asEvent({ type: 'auto_retry_start' }))[0]?.type).toBe('status')
  })

  it('degrades unknown event shapes to a status line instead of crashing', () => {
    const out = mapSessionEvents(asEvent({ type: 'something_new_from_upstream', data: { x: 1 } }))
    expect(out).toHaveLength(1)
    expect(out[0]?.type).toBe('status')
  })

  it('every mapped envelope type is part of the declared EngineEvent union', () => {
    const sample: EngineEvent[] = [
      ...mapSessionEvents(asEvent({ type: 'agent_start' })),
      ...mapSessionEvents(asEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'a' } })),
      ...mapSessionEvents(asEvent({ type: 'tool_execution_start', toolName: 't', toolCallId: 'c' })),
      ...mapSessionEvents(asEvent({ type: 'unknown' })),
    ]
    const types = new Set(sample.map((e) => e.type))
    for (const type of types) expect(ENGINE_EVENT_TYPES).toContain(type)
  })

  it('mapSessionEvent returns null for dropped events and arrays for multi mappings', () => {
    expect(mapSessionEvent(asEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_end' } }))).toBeNull()
    const single = mapSessionEvent(asEvent({ type: 'agent_end' }))
    expect(Array.isArray(single)).toBe(false)
  })
})
