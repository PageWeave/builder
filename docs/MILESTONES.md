# MILESTONES.md — Phased build plan

Each milestone: goal, tasks, acceptance criteria. Do not start a milestone whose platform dependency (SPEC-PLATFORM.md) is unresolved — surface it instead.

## M0 — Repo + planning docs ✅ (2026-09-16)

Done: `~/dev/pageweave-builder` created, git initialized, full handoff docs written.

## M1 — Electron skeleton + CI ✅ (2026-09-16)

**Goal:** Running app shell with clean process separation and dev loop. Done: pinned stack per DECISIONS D12 (electron 44, electron-vite 5 + vite 7, TS 5.9, React 19, Tailwind 4 + daisyUI 5), sandboxed CJS preload in ESM project, engine utility process with MessageChannelMain ping-pong + crash backoff, typed `window.pw` bridge, security posture + config tests, CI (verify + xvfb boot smoke + gitleaks) green on `PageWeave/builder`. CI proves the full boot path headlessly (local machines without a display can't).

Tasks:
1. Scaffold: `electron-vite` + React + TypeScript strict + Tailwind 4. Structure `src/{main,renderer,preload,engine,shared}`.
2. Preload: typed `contextBridge` API (`window.pw`), IPC contract types in `src/shared/ipc.ts` (single source for both sides).
3. Utility process boot: main spawns an empty `src/engine/index.ts` utility process, ping/pong over MessagePort (engine harness for M3).
4. Window: renderer shows static "PageWeave Builder" shell (empty chat/site-picker/preview layout placeholders).
5. Tooling: ESLint + `npm run lint` / `typecheck` / `test` (Vitest, one IPC contract test), CI via GitHub Actions on the repo's remote (create with user's account when pushed — ask user).
6. Hardening defaults from ARCHITECTURE.md § Security posture from day one (sandbox, contextIsolation, CSP).

**Accept when:** `npm run dev` opens the app; typed ping-pong renderer→main→utility returns; lint/typecheck/tests green; app has zero renderer Node access (assert via CSP + config test).

## M2 — Auth + websites

**Depends on:** SPEC-PLATFORM § OAuth (client registration + endpoints CONFIRM items).

Tasks:
1. OAuth module in main: system browser → loopback `127.0.0.1:<port>/callback`, PKCE pair, token exchange + refresh, safeStorage persistence.
2. Signed-out/signed-in app states; sign out (revoke + clear storage).
3. Website list: main asks engine (M3 stub for now: a temporary MCP-over-HTTPS client OR defer this display to M3 — do NOT build a parallel REST client; MCP is the data plane).

**Accept when:** fresh install → "Sign in" → browser → back in app signed in; token survives restart; website list renders; sign-out clears everything.

## M3 — Engine (Pi + MCP + BYOK)

Tasks:
1. Engine module owns Pi: `createAgentSession` with minimal tools (`read` only), `SessionManager` in userData, bundled skills via custom resource loader, versioned `systemPromptOverride` (`src/engine/prompt.ts`).
2. MCP: `pi-mcp-adapter` `createMcpAdapter` with isolated config (Bearer token from main). Evaluate `directTools: true` vs `"search"` — measure context cost with the real ~45-tool server; record decision in DECISIONS.md.
3. BYOK: model-connect UI (renderer) → main (safeStorage) → engine (model + key). Providers: anthropic, openai, google, openrouter, custom OpenAI-compatible (baseURL + model id via pi `models.json` shape).
4. Event bridge: Pi session events → MessagePort → main → renderer (typed envelope in `src/shared/engine-events.ts`).
5. Debug chat console (temporary renderer view, no polish) to exercise the full loop.

**Accept when:** in debug console: "list my websites" → MCP `list_websites` tool call over HTTPS succeeds with Bearer auth and returns real sites; a page-editing prompt round-trips (`get_page` → `update_page`); confirmation workflow URLs surface as events; compaction doesn't break a long session.

## M4 — Product UI

Tasks:
1. Chat: streaming markdown, tool-call cards (name/title/status, collapsed), confirmation cards (`shell.openExternal`), abort, per-site conversation list (Pi sessions), error surfaces.
2. Site picker: sites from `list_websites`; create-site flow = guided chat prompt (agent runs `create_website` via MCP); site switcher re-scopes conversations.
3. Preview pane: `WebContentsView`, session partition, loads selected site's dev env URL; refresh triggered by engine events for page/snippet/component/theme tool completions; navigation fenced to `*.pageweave.site`/`pageweave.dev`.
4. First-run flow: sign in → connect model → pick/create site → chat. Copy targets non-technical users; recommend OpenRouter as the easy default in the connect flow (per D5).
5. Replace debug console with product UI; Playwright `_electron` smoke E2E of the full loop.

**Accept when:** E2E: fresh profile → sign in → connect key → create site via chat → prompt an edit → preview updates without manual refresh → confirmation card flow works.

## M5 — Ship

Tasks:
1. `electron-builder`: macOS (dmg, universal or arm64+x64), Windows (nsis x64). App id/name per SPEC-PLATFORM.
2. Signing: Apple Developer ID + notarization; Windows code signing cert (ask user which CA/EV). Requires secrets in CI — set up with user, never commit.
3. Auto-update: `electron-updater` generic feed (host on pageweave.dev — platform task) or GitHub releases; staged rollout + rollback tested.
4. Release checklist doc (`docs/RELEASE.md`): versions, signing, notes, update-feed update.

**Accept when:** signed+notarized installers install clean on a clean macOS + Windows machine/VM; auto-update pulls a newer version end-to-end.

## M6+ — Backlog (not committed)

- PageWeave-hosted OpenAI-compatible LLM gateway (kills BYOK friction; usage-based pricing; design from OpenCode Zen precedent)
- Linux builds
- Publish/feedback UI, domains UI
- Native approval UX for workflow confirmations (replace browser hop, needs platform API)
- Preview auth for password-protected environments (header/cookie injection spike — see RISKS)
- Nested sessions ("subagent-lite") if prompt complexity demands it
