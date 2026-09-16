---
name: electron-security
description: Electron security posture for this repo — hardened webPreferences, CSP placeholder swap, sandboxed CJS preload, navigation/window fences, deny-all permission handlers, shell.openExternal validation, IPC input validation, fuses at M5, gitleaks in CI. Use when creating/modifying any BrowserWindow or WebContentsView, touching CSP, preload scripts, permissions, navigation, external links, OAuth token handling, or reviewing security of anything renderer-facing.
---

# Electron security posture (this repo)

Read first: `docs/ARCHITECTURE.md` § Security posture, `docs/DECISIONS.md` D10.
Official checklist: https://electronjs.org/docs/latest/tutorial/security

## Non-negotiable defaults

Every window/view gets (see `src/main/window.ts` — the single options factory):

```
sandbox: true, contextIsolation: true, nodeIntegration: false,
nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
webSecurity: true, webviewTag: false,
allowRunningInsecureContent: false, experimentalFeatures: false
```

- `app.enableSandbox()` is called before app ready — sandbox is global, not per-window opt-in.
- Preload scripts: CJS only (see the electron-vite skill for why), expose ONLY the typed `window.pw` surface via `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer`, `require`, or pass-through `(channel, ...args)` shims.
- **Secrets never enter the renderer.** OAuth tokens + model keys live in main + `safeStorage`. Engine gets them via spawn args / MessagePort — never via renderer IPC. No token in logs or error messages.

## Layers to maintain

1. **CSP** — `src/renderer/index.html` holds a `__CSP__` placeholder swapped per mode by the `csp()` plugin (`src/shared/csp.ts` holds both strings). Prod `script-src 'self'` — never add `'unsafe-eval'`; `'unsafe-inline'` in scripts is dev-only. `tests/security-config.test.ts` guards the prod string.
2. **Permission handlers** — deny all on every session that loads content: `session.setPermissionRequestHandler(() => false)` and `setPermissionCheckHandler(() => false)`. The M4 preview `WebContentsView` gets its own partition — wire the same deny-all there.
3. **Navigation fences** — `will-navigate` → allow only the dev URL / our own file; else `event.preventDefault()`. `setWindowOpenHandler` → `{ action: 'deny' }` always; open external links via `shell.openExternal` (4) instead.
4. **`shell.openExternal` validation** — only `https:` URLs, parsed with `new URL()` first. Never pass raw strings. Workflow confirmation URLs (D10) go through this path in M4.
5. **IPC input validation** — main validates every payload from the renderer before use (see electron-ipc skill). Renderer messages are untrusted input.
6. **Preview pane (M4)** — `WebContentsView` with its own session partition, no Node, navigation fenced to `*.pageweave.site` + `pageweave.dev` (and `*.env.pageweave.site`).

## M5 items (do not skip when packaging lands)

- **Fuses** via `@electron/fuses` (electron-builder `electronFuses` config): disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `GrantFileProtocolExtraPrivileges`; enable `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` (both together — one without the other is bypassable via a sibling `app/` folder).
- **ASAR integrity + code signing + HTTPS-only update feed with signature verification** (electron-updater verifies by default — don't disable).
- **Gitleaks** job runs in CI — keep it green; never commit tokens/keys, including in test fixtures (use obviously fake values like `sk-test-000`).

## Red flags (each is a critical vuln, not style)

- Any `webPreferences` weakening not present in the window.ts factory.
- `webSecurity: false`, `allowpopups`, `sandbox: false`, `contextIsolation: false`.
- Loading remote content in a window with Node access; `file://` for app content is avoided in favor of electron-vite's loader — don't reintroduce raw `file://` handling.
- CSP weakened in `CSP_PROD`, or the `__CSP__` placeholder removed/ignored.
- Storing anything secret in `localStorage`/renderer state beyond session life.
- Suppressing the security config tests to make a change pass.

## Testing this posture

- `tests/security-config.test.ts` (Vitest, no Electron launch) asserts the options factory + CSP string.
- M4 adds Playwright `_electron` security assertions: renderer has no `process`/`require`, inline script injection blocked, eval blocked (see testing skill).

## Sources

- Electron security checklist: https://electronjs.org/docs/latest/tutorial/security
- 1Password/electron-secure-defaults; agents-inc `desktop-security-electron` skill (fuse + ASAR patterns)
- helpmetest.com Electron security testing guide (2026-05) — Playwright security assertion patterns
