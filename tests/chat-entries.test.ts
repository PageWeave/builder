import { describe, expect, it } from 'vitest'
import type { EngineEvent, HistoryMessage } from '../src/shared/engine-events'
import {
  applyChatEvent,
  buildFromHistory,
  extractConfirmUrl,
  freshEntries,
  type ChatEntry,
} from '../src/renderer/src/components/chat-entries'

describe('chat transcript reducer (pure)', () => {
  it('accumulates text and thinking deltas into open entries', () => {
    let entries = freshEntries()
    entries = applyChatEvent(entries, { type: 'text_delta', delta: 'Hel' })
    entries = applyChatEvent(entries, { type: 'text_delta', delta: 'lo' })
    expect(entries).toEqual([{ id: 1, kind: 'assistant', text: 'Hello', streaming: true }])
    entries = applyChatEvent(entries, { type: 'thinking_delta', delta: 'hmm ' })
    entries = applyChatEvent(entries, { type: 'thinking_delta', delta: 'ok' })
    expect(entries[1]).toEqual({ id: 2, kind: 'thinking', text: 'hmm ok' })
  })

  it('opens a new assistant entry after a settled one', () => {
    let entries = freshEntries()
    entries = applyChatEvent(entries, { type: 'text_delta', delta: 'first' })
    entries = applyChatEvent(entries, { type: 'agent_end' })
    entries = applyChatEvent(entries, { type: 'text_delta', delta: 'second' })
    const assistants = entries.filter((e): e is Extract<ChatEntry, { kind: 'assistant' }> => e.kind === 'assistant')
    expect(assistants).toHaveLength(2)
    expect(assistants[0]?.streaming).toBe(false)
    expect(assistants[1]?.text).toBe('second')
  })

  it('tracks tool calls by callId and folds results with confirm URLs', () => {
    let entries = freshEntries()
    entries = applyChatEvent(entries, {
      type: 'tool_start',
      callId: 'c1',
      name: 'mcp__pageweave__update_page',
    })
    entries = applyChatEvent(entries, {
      type: 'tool_end',
      callId: 'c1',
      name: 'mcp__pageweave__update_page',
      isError: false,
      outputPreview: 'needs confirmation: https://pageweave.dev/workflow/confirm/abc',
    })
    expect(entries).toHaveLength(2)
    const tool = entries[0]?.kind === 'tool' ? entries[0].tool : null
    expect(tool?.status).toBe('ok')
    expect(tool?.confirmUrl).toBe('https://pageweave.dev/workflow/confirm/abc')
    // Confirmation gets its own always-visible row (never buried in the collapsed card).
    expect(entries[1]).toEqual({
      id: entries[1]?.id,
      kind: 'confirm',
      url: 'https://pageweave.dev/workflow/confirm/abc',
    })
  })

  it('matches tool_end to the right card and handles unknown ids', () => {
    let entries = freshEntries()
    entries = applyChatEvent(entries, { type: 'tool_start', callId: 'a', name: 'toolA' })
    entries = applyChatEvent(entries, { type: 'tool_start', callId: 'b', name: 'toolB' })
    entries = applyChatEvent(entries, { type: 'tool_end', callId: 'b', name: 'toolB', isError: true })
    expect(entries[0]?.kind === 'tool' && entries[0].tool.status).toBe('running')
    expect(entries[1]?.kind === 'tool' && entries[1].tool.status).toBe('failed')
    expect(applyChatEvent(entries, { type: 'tool_end', callId: 'ghost', name: 'ghost', isError: false })).toEqual(entries)
  })

  it('resets on session events and appends status/error rows', () => {
    let entries = freshEntries()
    entries = applyChatEvent(entries, { type: 'text_delta', delta: 'x' })
    expect(applyChatEvent(entries, { type: 'session', sessionId: 's', websiteId: 'w' })).toEqual([])
    expect(applyChatEvent(entries, { type: 'status', message: 'compacting' })).toHaveLength(2)
    expect(applyChatEvent(entries, { type: 'error', message: 'boom' })[1]?.kind).toBe('error')
  })

  it('rebuilds the transcript from history messages', () => {
    const history: HistoryMessage[] = [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello', thinking: 'thought', toolCalls: [{ id: 't1', name: 'grep', isError: false, outputPreview: 'https://pageweave.dev/x' }] },
    ]
    const entries = buildFromHistory(history)
    expect(entries.map((e) => e.kind)).toEqual(['user', 'assistant', 'tool', 'confirm'])
    const tool = entries[2]
    expect(tool?.kind === 'tool' && tool.tool.confirmUrl).toBe('https://pageweave.dev/x')
    expect(entries[3]?.kind === 'confirm' && entries[3].url).toBe('https://pageweave.dev/x')
  })

  it('extractConfirmUrl picks the first allowlisted URL and strips trailing punctuation', () => {
    expect(extractConfirmUrl('see https://pageweave.dev/flow/a. then done')).toBe('https://pageweave.dev/flow/a')
    expect(extractConfirmUrl('none here')).toBeUndefined()
    expect(extractConfirmUrl('https://evil.io/x')).toBeUndefined()
  })
})

describe('EngineEvent-type coverage note', () => {
  it('reducer ignores unknown event types without crashing', () => {
    const entries = freshEntries()
    const bogus = { type: 'unknown-future-event' } as unknown as EngineEvent
    expect(applyChatEvent(entries, bogus)).toBe(entries)
  })
})
