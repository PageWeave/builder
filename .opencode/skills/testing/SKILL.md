---
name: testing
description: Test strategy for this repo — Vitest (node env) unit/contract tests, vi.mock("electron") pattern, CI boot smoke via xvfb, Vitest Browser Mode for components at M4, Playwright _electron E2E at M4 with security assertions, _electron deprecation watch. Use when writing or running any test, configuring vitest, setting up Playwright E2E, debugging CI test failures, or deciding how to test a new feature.
---

# Testing (this repo)

Read first: `docs/MILESTONES.md` (acceptance criteria per milestone), `AGENTS.md` (new features land with tests).

## The pyramid for this repo

| Layer | Tool | Status |
|---|---|---|
| Unit/contract (main, engine, shared) | **Vitest**, node env | From M1 |
| Renderer components | **Vitest Browser Mode** (`vitest-browser-react`, real Chromium) | M4 decision — do NOT add jsdom/Testing Library as default |
| E2E (full app incl. IPC) | **Playwright `_electron`** | From M4 |
| Boot smoke | Built app launched under `xvfb-run` in CI, log assertions | From M1 CI |

## Vitest rules (now)

- `vitest.config.ts` is separate from `electron.vite.config.ts` — **vitest does not read electron.vite.config.ts**. Tests live in `tests/`, run via `npm run test`.
- Extract logic into pure functions and test them directly: `mainWindowOptions()` (window.ts) and the engine's ping handler are the M1 examples. Never unit-test IPC plumbing itself — `ipcMain.handle` registration is framework; test what the handler computes.
- If code under test imports `electron` and can't be split into a pure function, `vi.mock("electron", () => ({ ...minimal stubs... }))`. Prefer extraction; mocking is the fallback.
- `tests/security-config.test.ts` guards the hardened webPreferences + production CSP. If a change makes it fail, the change is wrong — do not weaken the test to pass.
- `tests/ipc-contract.test.ts` asserts channel constants and envelope-kind pairing from `src/shared/ipc.ts`.

## CI boot smoke (from M1)

GitHub Actions ubuntu runner: `xvfb-run -a` wraps the electron launch (preinstalled on `ubuntu-latest`; apt-install `libgtk-3-0 libnss3 libasound2` if missing). CI-only: pass `--no-sandbox` (Chromium's OS sandbox doesn't work on CI users; NEVER ship this flag). Assert on logs: engine spawn + pong round trip. Keep the app launch short-lived (quit after first pong or timeout) so the job doesn't hang.

## Playwright `_electron` (M4)

```ts
import { test, expect, _electron as electron } from '@playwright/test'
const app = await electron.launch({ args: ['out/main/index.js'] })
const win = await app.firstWindow()
// app.evaluate(({ dialog }) => {...}) runs in the real main process
await app.close() // ALWAYS — leaked processes break CI
```

- Stub native dialogs via `app.evaluate` before triggering them — they block and Playwright can't click them.
- Security assertions (from the M4 acceptance work): renderer has no `process`/`require`; inline `<script>` injection blocked; `eval` throws. 
- ⚠️ **Deprecation watch:** Microsoft has signalled `_electron` may be deprecated (Playwright MCP PR #1291, 2026). If it lands, pivot to raw CDP (`chrome-remote-interface`). Re-check before starting M4; record status in DECISIONS.md.
- E2E needs the app BUILT first (`npm run build`), not dev mode.

## Red flags

- Adding jsdom "for convenience" — wrong default for this repo (see renderer-ui skill).
- Tests importing renderer code into node-env tests or vice versa (two tsconfigs exist for a reason).
- Flaky-tolerant CI: no `retries` on unit tests; E2E gets at most 1.
- Long-running electron processes left open in a test run.
- Skipping the security config tests because a feature "needs" a weaker setting.

## Sources

- agents-inc `desktop-testing-electron` skill (mock patterns, xvfb, dialog stubbing)
- Vitest Browser Mode guide: https://vitest.dev/guide/browser/ (stable since Vitest 4)
- helpmetest.com Electron security testing (2026-05) — Playwright security assertions
- Spectron is dead since Electron 24; Playwright is the replacement
