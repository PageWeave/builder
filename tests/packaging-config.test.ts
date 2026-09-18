import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guards the packaging posture (M5): hardened fuses, GitHub draft feed,
 * bundle-only files. Text assertions on electron-builder.yml — same style as
 * security-config.test.ts; no YAML parser dependency.
 */
const yml = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8')

describe('electron-builder.yml', () => {
  it('pins app identity', () => {
    expect(yml).toContain('appId: dev.pageweave.builder')
    expect(yml).toContain('productName: PageWeave Builder')
  })

  it('ships only the bundle', () => {
    expect(yml).toMatch(/files:\n {2}- out\/\*\*/)
    expect(yml).toContain('asar: true')
    expect(yml).toContain('npmRebuild: false')
  })

  it('disables the dangerous fuses', () => {
    expect(yml).toContain('runAsNode: false')
    expect(yml).toContain('enableNodeOptionsEnvironmentVariable: false')
    expect(yml).toContain('enableNodeCliInspectArguments: false')
    expect(yml).toContain('grantFileProtocolExtraPrivileges: false')
  })

  it('enables cookie encryption and ASAR integrity as a pair', () => {
    expect(yml).toContain('enableCookieEncryption: true')
    expect(yml).toContain('enableEmbeddedAsarIntegrityValidation: true')
    expect(yml).toContain('onlyLoadAppFromAsar: true')
  })

  it('publishes signed-off drafts to GitHub Releases', () => {
    expect(yml).toContain('provider: github')
    expect(yml).toContain('owner: PageWeave')
    expect(yml).toContain('repo: builder')
    expect(yml).toContain('releaseType: draft')
  })

  it('keeps the update feed verification posture documented', () => {
    expect(yml).toContain('verifies signatures')
  })
})
