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

## M2 — Auth ✅ (2026-09-17)

**Depends on:** SPEC-PLATFORM § OAuth — resolved 2026-09-17 (dynamic client registration; no platform-side task, see D13).

Tasks:
1. OAuth module in main (`src/main/auth/`, DECISIONS D13): `openid-client@6.8.8` — RFC 8252 system-browser flow via `shell.openExternal`, ephemeral loopback `127.0.0.1:<port>/callback` (one portless registered URI; platform ignores loopback ports), PKCE S256 + state, RFC 7591 dynamic client registration **once per install** (persisted, throttle-aware), refresh (single-flight, proactive 5-min margin + on-demand), RFC 7009 revocation on sign-out, `safeStorage`-only persistence (atomic 0600 writes; refuses plaintext).
2. Signed-out / signing-in / signed-in app states over typed IPC (`window.pw.auth`), state push with unsubscribe; tokens never leave main.
3. Website list: **deferred to M3** (2026-09-17) — MCP is the only data plane; calling MCP from main would build a parallel client. Surfaces naturally once the engine wires the adapter.

**Accept when:** fresh install → "Sign in" → browser → back in app signed in; token survives restart (silent refresh at boot); sign-out clears everything. Automated coverage: 28 unit/contract tests (PKCE S256 cross-check, state-forgery drop, loopback server behaviors incl. one-shot/timeout/escaping, store round-trip + unavailable-keyring refusal, refresh-token fallback) + CI boot smoke. **The real browser round-trip is a manual acceptance on a user machine** (CI is headless; browser required).

## M3 — Engine (Pi + MCP + BYOK) ✅ (2026-09-18, acceptance run pending)

Tasks (done per DECISIONS D14):
1. Engine module owns Pi: `createAgentSession` with `tools: ["read", "grep"]` (read+grep amendment to D10 — output-guard spill navigation), `SessionManager` under `<userData>/work/<websiteId>` with `PI_CODING_AGENT_DIR=<userData>/agent`, bundled skills synced from build-time `?raw` resources, versioned `systemPromptOverride` (`src/engine/prompt.ts` v1), empty `agentsFilesOverride` (no ambient AGENTS.md).
2. MCP: `pi-mcp-adapter` `createMcpAdapter` isolated config (`auth: 'bearer'`, `bearerToken: '${PW_ACCESS_TOKEN}'` env-interpolated, `lifecycle: 'lazy'`), `directTools: true` + `freezeDirectTools: true`; token rotation via main → engine `token-updated` push. Sampling/elicitation off (no embedded UI); script tool on.
3. BYOK: model-connect UI (provider/key/model; OpenRouter default per D5) → main safeStorage (`model.enc`) → engine `configure` → `ModelRuntime.setRuntimeApiKey` (in-memory only). Custom OpenAI-compatible endpoints via `pi.registerProvider` extension. `model:list` resolves availability in-engine via `getAvailable()`.
4. Event bridge: Pi session events → typed renderer-safe envelopes (`src/shared/engine-events.ts`) → MessagePort notices → main → `engine:event` push. Engine requests: ping/configure/token-updated/open-session/prompt/steer/abort/list-models with per-kind timeouts; crash restart replays configure + session.
5. Debug chat console (renderer): streaming transcript (text/thinking deltas, tool cards with output previews, status/error lines), abort, model-connect form, sign-in gate.

**Accept when (live, needs user machine + PageWeave account + model key):** "list my websites" → MCP `list_websites` over HTTPS with Bearer auth returns real sites; a page-editing prompt round-trips (`get_page` → `update_page`); confirmation workflow URLs surface in tool results; a long session compacts without breaking. Also measure directTools vs proxy prompt-token cost (D14). Automated coverage so far: 49 tests (envelope mapping, MCP config contract, skills/prompts, IPC contract incl. new engine kinds) + build (15.15 MB single-file engine chunk) + CI boot smoke.

## M4 — Product UI (in progress — C1+C2+C3+C4 done 2026-09-18)

C4 shipped: `src/main/preview.ts` PreviewHost (WebContentsView, persist partition, hardened webPreferences, deny-all window-open, allowlist-fenced navigation, validated bounds IPC), renderer PreviewPane with rect streaming (ResizeObserver + rAF), dev-env URL load, manual/open-in-browser buttons, 2 s debounced auto-refresh on content-mutation tool events.

C3 shipped: product chat (stream-md markdown per D16, thinking/tool cards, confirmation buttons via the shared URL allowlist, abort, error surfaces), app:openExternal + debug:toggle IPC, menu View → Debug Console (Cmd/Ctrl+Shift+D), will-navigate fence routes allowlisted https links to the system browser, pure transcript reducer (73 tests).

C2 shipped: three-pane shell, site picker (auto-refresh on site-mutation tool events), per-site conversation switcher, first-run gates, guided create-site prompt, model changes reopen the last scope.

C1 shipped: conversation model per DECISIONS D15 (open-session resume/switch/fresh, `list-sessions`, bounded `history` backfill event), site-picker data via the engine's official-MCP-SDK client (`list-websites`), IPC `session:list` + `sites:list`, 63 tests.

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
