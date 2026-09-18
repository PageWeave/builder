import { describe, expect, it } from 'vitest'
import { isPathInside, toConversationSummary } from '../src/engine/session'

describe('conversation scope guards (pure)', () => {
  it('isPathInside accepts only files strictly inside the site work dir', () => {
    expect(isPathInside('/data/work/site-a', '/data/work/site-a/session.jsonl')).toBe(true)
    expect(isPathInside('/data/work/site-a', '/data/work/site-a/sub/dir/session.jsonl')).toBe(true)
    expect(isPathInside('/data/work/site-a', '/data/work/site-b/session.jsonl')).toBe(false)
    expect(isPathInside('/data/work/site-a', '/data/work/site-a-suffix/session.jsonl')).toBe(false)
    // The dir itself is not a conversation.
    expect(isPathInside('/data/work/site-a', '/data/work/site-a')).toBe(false)
    // Traversal stays blocked regardless of platform normalization.
    expect(isPathInside('/data/work/site-a', '/data/work/site-a/../site-b/x.jsonl')).toBe(false)
  })

  it('toConversationSummary maps pi SessionInfo defensively', () => {
    expect(
      toConversationSummary({
        path: '/data/work/site-a/session.jsonl',
        id: 's1',
        name: 'Rename the hero',
        firstMessage: 'Please rename…',
        modified: new Date('2026-09-18T10:00:00Z'),
        messageCount: 42,
      }),
    ).toEqual({
      path: '/data/work/site-a/session.jsonl',
      id: 's1',
      name: 'Rename the hero',
      firstMessage: 'Please rename…',
      modified: '2026-09-18T10:00:00.000Z',
      messageCount: 42,
    })
  })

  it('accepts ISO-string modified dates and omits blank names', () => {
    expect(
      toConversationSummary({
        path: '/p/s.jsonl',
        id: 's2',
        firstMessage: 'x',
        modified: '2026-09-18T10:00:00Z',
        messageCount: 1,
        name: '   ',
      }),
    ).toEqual({ path: '/p/s.jsonl', id: 's2', firstMessage: 'x', modified: '2026-09-18T10:00:00Z', messageCount: 1 })
  })

  it('truncates long first messages for the auto-title', () => {
    const summary = toConversationSummary({
      path: '/p/s.jsonl',
      id: 's3',
      firstMessage: 'y'.repeat(500),
      modified: '2026-09-18T10:00:00Z',
      messageCount: 0,
    })
    expect(summary?.firstMessage.length).toBe(201)
    expect(summary?.firstMessage.endsWith('…')).toBe(true)
  })

  it('returns null for malformed entries', () => {
    expect(toConversationSummary(null)).toBeNull()
    expect(toConversationSummary('nope')).toBeNull()
    expect(toConversationSummary({ id: 's4', modified: '2026-09-18T10:00:00Z' })).toBeNull()
    expect(toConversationSummary({ path: '/p/s.jsonl', modified: 'garbage' })).toBeNull()
  })
})
