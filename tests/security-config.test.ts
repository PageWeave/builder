import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mainWindowOptions } from '../src/main/window'
import { CSP_PROD } from '../src/shared/csp'

/**
 * Security posture test — no Electron launch needed. Guards the hardened
 * webPreferences factory and the production CSP. If a change fails here, fix
 * the change, not the test (see electron-security skill).
 */
describe('renderer security posture', () => {
  const opts = mainWindowOptions('/fake/preload.cjs')
  const prefs = opts.webPreferences

  it('webPreferences are hardened', () => {
    expect(prefs).toBeDefined()
    expect(prefs?.sandbox).toBe(true)
    expect(prefs?.contextIsolation).toBe(true)
    expect(prefs?.nodeIntegration).toBe(false)
    expect(prefs?.nodeIntegrationInWorker).toBe(false)
    expect(prefs?.nodeIntegrationInSubFrames).toBe(false)
    expect(prefs?.webSecurity).toBe(true)
    expect(prefs?.webviewTag).toBe(false)
    expect(prefs?.allowRunningInsecureContent).toBe(false)
    expect(prefs?.experimentalFeatures).toBe(false)
  })

  it('production CSP keeps script-src strict', () => {
    const scriptSrc = /script-src[^;]*/.exec(CSP_PROD)?.[0]
    expect(scriptSrc).toBe("script-src 'self'")
    expect(CSP_PROD).not.toContain("'unsafe-eval'")
  })

  it('index.html routes CSP through the placeholder (not a static policy)', () => {
    const html = readFileSync(fileURLToPath(new URL('../src/renderer/index.html', import.meta.url)), 'utf8')
    expect(html).toContain('content="__CSP__"')
  })
})
