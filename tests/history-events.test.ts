import { describe, expect, it } from 'vitest'
import { buildHistoryMessages, mapHistoryMessages } from '../src/engine/events'
import { HISTORY_MAX_MESSAGES, HISTORY_TEXT_MAX_CHARS } from '../src/shared/engine-events'

describe('history backfill mapping (pure)', () => {
  it('maps user messages with text and image placeholders', () => {
    const messages = [
      { role: 'user', content: 'Fix the hero section' },
      { role: 'user', content: [{ type: 'text', text: 'Look at this' }, { type: 'image', data: '…' }] },
    ]
    expect(buildHistoryMessages(messages)).toEqual([
      { role: 'user', text: 'Fix the hero section' },
      { role: 'user', text: 'Look at this\n\n[image]' },
    ])
  })

  it('maps assistant text, thinking, and tool calls; folds tool results in', () => {
    const messages = [
      { role: 'user', content: 'List my pages' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Use list_pages.' },
          { type: 'text', text: 'On it.' },
          { type: 'toolCall', id: 'c1', name: 'mcp__pageweave__list_pages', arguments: {} },
          { type: 'toolCall', id: 'c2', name: 'mcp__pageweave__update_page', arguments: {} },
        ],
      },
      { role: 'toolResult', toolCallId: 'c1', toolName: 'list_pages', content: [{ type: 'text', text: '[]' }], isError: false },
      { role: 'toolResult', toolCallId: 'c2', toolName: 'update_page', content: [{ type: 'text', text: 'boom' }], isError: true },
      { role: 'toolResult', toolCallId: 'missing-id', content: [{ type: 'text', text: 'orphan' }], isError: false },
    ]
    expect(buildHistoryMessages(messages)).toEqual([
      { role: 'user', text: 'List my pages' },
      {
        role: 'assistant',
        text: 'On it.',
        thinking: 'Use list_pages.',
        toolCalls: [
          { id: 'c1', name: 'mcp__pageweave__list_pages', isError: false, outputPreview: '[]' },
          { id: 'c2', name: 'mcp__pageweave__update_page', isError: true, outputPreview: 'boom' },
        ],
      },
    ])
  })

  it('truncates oversized text and drops unknown roles', () => {
    const long = 'x'.repeat(HISTORY_TEXT_MAX_CHARS + 10)
    const messages = [
      { role: 'user', content: long },
      { role: 'compaction', content: 'marker' },
      { role: 'assistant', content: [] },
    ]
    const mapped = buildHistoryMessages(messages)
    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.text).toBe(
      `${'x'.repeat(HISTORY_TEXT_MAX_CHARS)}… [truncated 10 chars]`,
    )
  })

  it('caps the number of rebuilt messages', () => {
    const flood = Array.from({ length: HISTORY_MAX_MESSAGES + 50 }, () => ({ role: 'user', content: 'hi' }))
    expect(buildHistoryMessages(flood)).toHaveLength(HISTORY_MAX_MESSAGES)
  })

  it('returns the bounded history envelope with session scope', () => {
    const event = mapHistoryMessages('s1', 'site-a', [{ role: 'user', content: 'hello' }])
    expect(event.type).toBe('history')
    expect(event.sessionId).toBe('s1')
    expect(event.websiteId).toBe('site-a')
    expect(event.messages).toEqual([{ role: 'user', text: 'hello' }])
  })

  it('handles non-array and missing content defensively', () => {
    expect(buildHistoryMessages(null)).toEqual([])
    expect(buildHistoryMessages('nope')).toEqual([])
    expect(buildHistoryMessages([{ role: 'user' }, { role: 'assistant' }])).toEqual([
      { role: 'user', text: '' },
      { role: 'assistant', text: '' },
    ])
  })
})
