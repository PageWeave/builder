import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '../src/shared/confirm-urls'

describe('external URL allowlist (pure, shared by main + renderer)', () => {
  it('allows https on pageweave-controlled hosts', () => {
    expect(isAllowedExternalUrl('https://pageweave.dev/workflows/abc123')).toBe(true)
    expect(isAllowedExternalUrl('https://mysite.pageweave.site/workflow?token=x')).toBe(true)
    expect(isAllowedExternalUrl('https://dev.mysite.env.pageweave.site/x')).toBe(true)
    expect(isAllowedExternalUrl('https://www.pageweave.dev/')).toBe(true)
    expect(isAllowedExternalUrl('https://docs.pageweave.dev/guide')).toBe(true)
  })

  it('rejects non-https, foreign hosts, credentials, and malformed input', () => {
    expect(isAllowedExternalUrl('http://pageweave.dev/x')).toBe(false)
    expect(isAllowedExternalUrl('https://evil.example.com/workflow')).toBe(false)
    expect(isAllowedExternalUrl('https://pageweave.dev.evil.io/x')).toBe(false)
    expect(isAllowedExternalUrl('https://user:pass@pageweave.dev/x')).toBe(false)
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })
})
