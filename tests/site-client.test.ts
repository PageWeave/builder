import { describe, expect, it } from 'vitest'
import {
  extractToolJson,
  parseWebsiteDetail,
  parseWebsiteList,
} from '../src/engine/site-client'

describe('site client parsers (pure)', () => {
  it('extractToolJson prefers structuredContent, falls back to JSON text', () => {
    expect(extractToolJson({ structuredContent: { websites: [] } })).toEqual({ websites: [] })
    expect(extractToolJson({ content: [{ type: 'text', text: '{"a":1}' }] })).toEqual({ a: 1 })
    expect(extractToolJson({ content: [{ type: 'text', text: 'not json' }] })).toBe('not json')
    expect(extractToolJson({ content: [{ type: 'image' }] })).toBeNull()
    expect(extractToolJson(null)).toBeNull()
  })

  it('parseWebsiteList accepts array and { websites } payloads, rejects unsafe ids', () => {
    const rows = [
      { id: '11111111-2222-3333-4444-555555555555', name: 'My Site' },
      { websiteId: '99999999-8888-7777-6666-555555555555', subdomain: 'blog' },
      { id: '../escape' },
      { noId: true },
      'garbage',
    ]
    expect(parseWebsiteList(rows)).toEqual([
      { id: '11111111-2222-3333-4444-555555555555', name: 'My Site' },
      { id: '99999999-8888-7777-6666-555555555555', name: 'blog' },
    ])
    expect(parseWebsiteList({ websites: rows })).toEqual(parseWebsiteList(rows))
    expect(parseWebsiteList(null)).toEqual([])
    expect(parseWebsiteList({ websites: 'nope' })).toEqual([])
  })

  it('parseWebsiteDetail merges environment URLs by env name', () => {
    const summary = { id: 'site-1', name: 'fallback-name' }
    const detail = {
      name: 'My Site',
      environments: [
        { name: 'dev', url: 'https://site-1.env.pageweave.site' },
        { name: 'default', url: 'https://site-1.pageweave.site' },
        { name: 'broken', url: 'ignored' },
      ],
    }
    expect(parseWebsiteDetail(detail, summary)).toEqual({
      id: 'site-1',
      name: 'My Site',
      devUrl: 'https://site-1.env.pageweave.site',
      liveUrl: 'https://site-1.pageweave.site',
    })
    // Detail without environments degrades to the summary, never crashes.
    expect(parseWebsiteDetail({ name: 'Only Name' }, summary)).toEqual({ id: 'site-1', name: 'Only Name' })
    expect(parseWebsiteDetail(null, summary)).toBeNull()
  })
})
