import type { BrowserWindowConstructorOptions } from 'electron'

/**
 * Hardened webPreferences + window options, as a pure factory so tests can
 * assert the security posture without launching Electron (see
 * tests/security-config.test.ts). Never add options here that weaken the
 * defaults below — see .opencode/skills/electron-security/SKILL.md.
 */
export function mainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'PageWeave Builder',
    show: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  }
}
