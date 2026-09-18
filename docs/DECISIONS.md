# DECISIONS.md — Decision log (ADR-style)

Each decision: context → choice → rationale → consequences. Locked unless a new decision supersedes it (then append, never edit history).

## D1 — Custom branded app; embed a harness as libraries. Never fork.

**Context (2026-09):** Goal = "PageWeave Desktop" for non-technical users. Options: fork OpenCode (rebrand), thin plugin distribution, custom app embedding an engine.
**Choice:** Build our own Electron app; embed an agent harness as npm dependencies.
**Rationale:** Forking a fast-moving repo (OpenCode: 13k+ commits, 950 contributors, mid V1→V2 rewrite) = permanent rebasing tax — the VS Code fork literature (Cursor ~100 engineers, Eclipse/EclipseSource analyses) is unanimous that forks start cheap and become a treadmill. Embedding gives total branding control (we ship none of their UI) and zero merge burden; engine updates are dependency bumps.
**Consequences:** We own all UI work. Power users who *want* raw OpenCode keep using the existing PageWeave MCP server directly — two funnels, no conflict.

## D2 — Agent runs locally on the user's machine.

**Context:** Hosted agent (Rails-side, e.g. extending the existing RubyLLM `Messaging::Agent` infra) vs local engine.
**Choice:** Local engine.
**Rationale:** (a) User constraint — harness-grade loop quality lives in mature harnesses, not in a custom Rails agent loop. (b) Server-side: minutes-long LLM streams would occupy Rails/worker processes and fight proxy timeouts; local keeps PageWeave handling only short MCP JSON-RPC calls it already serves well. (c) Compute scales with users' machines, not our servers.
**Consequences:** Users need model access (→ D5 BYOK v1). App must manage engine lifecycle.

## D3 — Engine = Pi (`@earendil-works/pi-coding-agent`), not OpenCode.

**Context:** Two SDK-first embeddable harnesses shortlisted. OpenCode: MIT, 203k★, full-featured (75+ providers, subagents, permission engine, LSP), but dev-centric, heavy (bun-compiled binary sidecar ~80MB or in-process server mid-rewrite V1→V2), lots of machinery to hide/lock down. Pi: MIT, ~94k★, 220+ contributors (badlogic + mitsuhiko), lean loop (compaction, sessions, retries, skills), SDK-first `createAgentSession()` designed for embedding in custom UIs (proven in production by OpenClaw), plain Node libs, MCP via first-class adapter ecosystem.
**Choice:** Pi.
**Rationale:** Our agent is **not a local coder** — it edits hosted sites through ~45 remote MCP tools. OpenCode's mass (local file tools, LSP, dev workflows, TUI) is dead weight we'd pay for in bundle size, lockdown effort, and upgrade churn during their V1→V2 transition. Pi's minimal core + `pi-mcp-adapter`'s `createMcpAdapter` (explicitly built for "an SDK or server integration that already owns its MCP configuration") matches our exact shape. Loop-quality difference vs OpenCode is marginal for a tool-calling agent; prompts/skills we author matter more.
**Consequences:** No built-in subagents/permission engine (accepted; D10 covers approvals, nested sessions possible later if ever needed). Narrower built-in provider catalog (majors covered; custom OpenAI-compatible via `models.json`). Third-party MCP adapter dependency (mitigation: vendor it — MIT, small). Package-scope rename churn risk (`@mariozechner/*` → `@earendil-works/*` happened once) → pin versions, isolate behind our engine module.

## D4 — Shell = Electron, not Tauri.

**Context:** 2026 framework comparisons + Tauri sidecar practitioner reports.
**Choice:** Electron.
**Rationale:** The app's entire core is a Node/TS backend (the engine). Electron runs it natively in a utility process — the documented pattern. Tauri's Rust backend forces the engine into a compiled sidecar (`bun build --compile`, ~80MB anyway) with target-triple naming, orphan-process guards, health-poll backoff, separate sidecar signing, custom binary self-update — practitioners document all of these as real costs; the size advantage evaporates for JS-engine products. One Chromium = rendering consistency on random consumer machines (chat/markdown/code UI). Team is TS/Rails, zero Rust. OpenCode's own desktop app and Dyad are Electron precedents to crib from.
**Consequences:** ~130–200MB installers, higher idle RAM, ~8-week Electron major treadmill (budget ~3 upgrades/yr, 2–4 dev-days each — schedule it), security config is on us (sandbox/contextIsolation/CSP defaults in ARCHITECTURE.md).

## D5 — Models v1 = BYOK via in-app guided connect flow. No PageWeave gateway in v1.

**Context:** Non-technical audience + "sign in and it works" ideal vs PageWeave operating margin/cost control on an OpenAI-compatible gateway (PageWeave already runs OpenRouter server-side for its own agents).
**Choice (user, 2026-09-16):** No gateway for now; OpenCode-default-style provider onboarding adapted into our UI: pick provider (Anthropic/OpenAI/Google/OpenRouter/custom OpenAI-compatible), paste key once, stored in `safeStorage`.
**Rationale:** Defers gateway billing/quota/abuse work; validates product before PageWeave becomes an LLM reseller.
**Consequences:** Model setup is the one "technical" moment in onboarding — mitigate with excellent copy + recommend OpenRouter as the easy default ("one key, all models"). Gateway remains the planned M6+ fix (DECISIONS history: hosting it also enables usage-based pricing).

## D6 — UI v1 scope = chat + site picker + preview. Nothing else.

**Choice (user, 2026-09-16).** No publish/feedback/domains/settings-beyond-models UI in v1. The agent itself covers the rest via chat (e.g. "publish this" → MCP release flow conversationally).
**Consequences:** Small, polishable surface; fastest path to real users.

## D7 — Auth = PageWeave OAuth (public client, PKCE). Token authorizes MCP.

**Choice:** Desktop app registers as a public OAuth client on pageweave.dev; system-browser flow + loopback redirect; `read write` scopes (the platform's coarse model); token in `safeStorage`; same token = MCP `Authorization: Bearer`.
**Consequences:** Requires a platform-side client registration (SPEC-PLATFORM § platform tasks). Refresh handling in main process.

## D8 — Product name = "PageWeave Builder".

**Context:** Candidates: "PageWeave Desktop" (working name), "PageWeave Creator" (user's earlier pick), plain "PageWeave" (research recommendation), "Weave".
**Research:** Meta relaunched "Creator Studio" (Jun–Aug 2026) as a standalone AI app; "creator" now reads as creator-economy/influencer category — wrong association. Descriptive suffixes (Creator/Builder/Studio/Pro) are the weakest trademark pattern and age badly as scope grows; monolithic naming (plain "PageWeave") is the recommended default for single-product SaaS.
**Choice (user, 2026-09-16):** "PageWeave Builder" — descriptive clarity for the target audience was valued over the trademark/longevity argument. Recorded tradeoff accepted.
**Consequences:** Repo/dir: `~/dev/pageweave-builder` (internal codename `pageweave-creator` retired). App id scheme in SPEC-PLATFORM.

## D9 — Docs-first repo, fresh-agent handoff.

**Choice (user, 2026-09-16):** This repo starts as a documentation bundle (this file set) so any future session can execute M1+ without the original research context. Docs are maintained as source of truth (see AGENTS.md).

## D10 — Destructive-action safety v1 = server-side workflow confirmations, rendered as cards.

**Context:** Pi has no permission engine; PageWeave MCP already requires user approval (workflow URLs, 6h expiry) for destructive tools.
**Choice:** Rely on the server-side confirmations; render workflow URLs as prominent cards in chat. No custom client permission layer in v1. Local tools for the agent are reduced to read-only (no bash/edit/write).
**Consequences:** Extra browser hop for approvals (acceptable v1); a native approval UX is a natural M6 item if it annoys users.

## D11 — Platforms: macOS + Windows first.

**Choice (user, 2026-09-16).** Linux builds later (Electron makes it cheap to add; signing/testing effort goes to the two mainstream platforms first). Apple silicon + Intel macs, x64 Windows.

## D12 — M1 toolchain: exact pins, hand-rolled scaffold, CJS preload, daisyUI, testing pyramid, AGPL.

**Context (2026-09-16, M1):** Scaffold decisions: generator vs hand-rolled, Vite/TypeScript majors, preload module format, UI kit, test layers, license. All versions verified against live npm peer ranges on 2026-09-16.

**Choices:**
- **Pins:** electron 44.4.x · electron-vite 5.0.0 · **vite 7.3.x (NOT 8** — electron-vite 5's peer range stops at ^7; electron-vite 6 is beta; upgrade as one deliberate wave when stable) · @vitejs/plugin-react 5.2 (v6 needs Vite 8) · **typescript 5.9 (NOT 7** — typescript-eslint 8.70 peers typescript <6.1) · react 19.3 · tailwindcss 4.3 + @tailwindcss/vite · **daisyui 5.7** (user choice: same design vocabulary as the PageWeave platform; semantic tokens only) · vitest 5 · eslint 10 flat + typescript-eslint 8.70. Package manager: npm.
- **Hand-rolled scaffold** over `npm create @quick-start/electron` (researched): the official template ships `sandbox: false` + ESM preload (violates our security posture), `^` ranges, no engine/shared layout, no tests/lint/CI — most of it would be rewritten. What we absorbed from the template: the `externalizeDepsPlugin()` question — deferred to M3, where we decide bundle-pi-into-engine-chunk vs externalize (measure, record here).
- **`"type": "module"` project + CJS preload:** sandboxed preload scripts cannot be ESM (ESM preload forces `sandbox: false`). electron-vite config forces the preload target to `format: 'cjs'` with `.cjs` filenames; main + engine ship as ESM (keeps pi's ESM-only packages clean at M3).
- **Testing pyramid:** Vitest node env from M1 (pure functions; `vi.mock("electron")` as fallback; never test IPC plumbing). **Vitest Browser Mode** (`vitest-browser-react`, real Chromium) is the M4 default for component tests — jsdom is deliberately NOT adopted. Playwright `_electron` E2E from M4. CI boot smoke under xvfb (`PW_SMOKE=1`, `--no-sandbox` is CI-only).
- **License: AGPL-3.0-only** (user choice — open source). Repo private for now; LICENSE present from day one; `license` field set in package.json.
- npm 11 install-script allowlist: `esbuild` + `electron` approved (unpinned) via package.json `allowScripts` — CI `npm ci` honors it.

**Consequences:** Upgrade waves are deliberate: electron-vite 6 + Vite 8 + plugin-react 6 land together once stable; TS 7 waits for typescript-eslint support. Engine deps (`@earendil-works/*`, `pi-mcp-adapter`) get their own pinned entries at M3. `.opencode/skills/` encodes these rules for agents (electron-vite, testing skills).

## D13 — OAuth client = openid-client 6.8.8 + dynamic client registration (no manual platform registration).

**Context (2026-09-17, M2):** The M0-era SPEC assumed a manually provisioned platform-side OAuth client and flagged it as an M2 blocker. The user corrected this: PageWeave exposes RFC 7591 dynamic client registration. Live verification (2026-09-17) confirmed RFC 8414 discovery, open DCR, public-client `none` auth, S256 PKCE, refresh grants, and an RFC 7009 revocation endpoint — no platform-side task exists or is needed.
**Choice:** `openid-client` **6.8.8** (panva, MIT, OIDF-certified RP, ~11.5M weekly downloads) exact-pinned, used ONLY in the main process, for: discovery (RFC 8414), dynamic registration (RFC 7591), PKCE S256 + state, code exchange, refresh, revocation. Electron built-ins cover the native half: ephemeral `node:http` loopback server bound to `127.0.0.1` only (RFC 8252 §7.3/§8.3), `shell.openExternal` for the system browser (RFC 8252 §8.12 — never an embedded window), `safeStorage` for at-rest encryption. ONE portless loopback URI is registered (`http://127.0.0.1/callback`); the platform's Doorkeeper stack ignores loopback ports at authorize time per RFC 8252 §7.3 (verified in Doorkeeper URIChecker source + the platform's own initializer exempting loopback from the HTTPS-redirect rule). Registration happens **once per install** and persists in safeStorage — the platform throttles `/oauth/register` at 5/h/IP; a 10-min in-process retry guard backs this.
**Rejected:** hand-rolled protocol code (re-implements a certified security surface — PKCE/state/refresh bugs are silent); community Electron OAuth wrappers (stale, no DCR/refresh); MSAL (Azure-locked); WorkOS AuthKit Electron (provider lock-in); private-use URI scheme redirect (needs OS protocol registration + packaged builds; loopback works identically in dev and prod); multi-port redirect_uri pools (non-standard complexity — any-port matching is a server MUST, not a courtesy).
**Consequences:** Main bundle grows ~24KB minified (openid-client + oauth4webapi, tree-shaken). `src/main/auth/` is the only consumer of openid-client/electron auth APIs. Renderer sees `AuthState` (status + secret-free error string) only. Engine gets tokens via `AuthController.getAccessToken()` at M3. Website-list display deferred to M3 — MCP is the only data plane (no parallel client from main). Linux without a keyring: persist refuses (clear error), sign-in works in-session only.

## D14 — Engine embedding shape: bundled pi chunk, direct tools, in-memory BYOK, env-token rotation.

**Context (2026-09-18, M3):** The M0-era sketches (`docs/ARCHITECTURE.md` § engine) were verified against live pi docs/source (pi-coding-agent 0.85.1, pi-ai 0.85.1, pi-mcp-adapter 2.34.0, pi-tui 0.85.1 — all exact-pinned) and adjusted. Key API reality: `ModelRuntime` owns credentials/catalogs (`setRuntimeApiKey` is runtime-only and never persisted; `InMemoryCredentialStore` avoids any auth.json); `createMcpAdapter({ config })` returns a bare extension factory wired via `DefaultResourceLoader({ extensionFactories })`; skills/context/system-prompt are loader constructor options; custom OpenAI-compatible providers register programmatically via `pi.registerProvider` — no `models.json` files.
**Choices:**
1. **Bundling (D12 follow-up, measured):** `main.build.externalizeDeps: false` + `inlineDynamicImports: true` → single self-contained engine chunk (15.15 MB, ~15 s build). Required, not just preferred: pi-mcp-adapter ships **raw TypeScript as its package entry**, so externalized it crashes at load ("Stripping types is unsupported under node_modules"). Code-split chunks broke the electron-vite `__filename` shim with a TDZ error. Externalizing was never viable.
2. **Tool surface:** `directTools: true` + `freezeDirectTools: true` for the ~45-tool PageWeave server — the model sees every tool immediately (reliability for non-technical users outweighs the ~7–14 k prompt-token cost; frozen registration keeps the provider prompt-cache prefix stable). Proxy/`"search"` modes trade context for discovery round-trips. **To measure in the acceptance run:** actual token cost of both modes against the live server; revisit via a new decision if it exceeds ~15 k tokens or degrades tool choice.
3. **Local tools widened `read` → `["read", "grep"]`** (user-approved amendment to D10): the MCP output guard spills >50 KiB results to temp files; navigating a spilled `get_page` HTML without grep means reading the whole file into context. Both tools are read-only — D10's no-write/no-shell boundary unchanged.
4. **BYOK keys:** renderer → main (`safeStorage`, `model.enc`, atomic 0600) → engine via MessagePort `configure` → `ModelRuntime.setRuntimeApiKey` (in-memory, priority-1 auth) for built-in providers; custom endpoints register an OpenAI-compatible provider with the key held in the factory closure. Keys never persist outside safeStorage, never in spawn args (ps-visible), never in the renderer.
5. **Token rotation to the MCP adapter:** the adapter config is an isolated snapshot, so a literal token would go stale at the 1 h expiry. Instead `bearerToken: '${PW_ACCESS_TOKEN}'` is env-interpolated at connection time and `lifecycle: 'lazy'` keeps connections short-lived; main pushes rotated tokens (`token-updated`) and the engine updates its process env, so every new connection carries a fresh token. Known edge (acceptance item): a connection alive across the 1 h mark 401s once, then reconnects with the fresh token.
6. **Session layout:** one Pi session per website — `cwd` = `<userData>/work/<websiteId>`, `PI_CODING_AGENT_DIR` = `<userData>/agent` (sessions, MCP metadata cache, catalogs; `~/.pi` never touched). Skills are bundled at build time (`?raw` into the chunk) and content-addressed-synced into `<userData>/agent/skills` at session build; `agentsFilesOverride` returns empty so no ambient AGENTS.md leaks into prompts.
**Rejected:** `requestHeadersCommand` per-request token injection (subprocess spawn per request needs a plaintext token file to read from — violates the at-rest rule); adapter-managed MCP OAuth (`auth: 'oauth'` — duplicates M2 auth, second client registration, loopback flow owned by the adapter instead of main); `models.json` files for custom providers (nothing to persist — the config is a UI form).
1. **(amendment) photon-node stays external:** pi's image-processing dep reads its `.wasm` via bare `__dirname` at module scope — a ReferenceError inside any bundled ESM chunk (found by the CI boot smoke; locally masked because the engine's no-parentPort guard `process.exit(1)`s before that module evaluates). `rollupOptions.external: [/^@silvia-odwyer\//]` keeps it a plain CJS require from node_modules where `__dirname` is real. Consequence: M5 packaging must ship node_modules for that one package (electron-builder ships `dependencies` by default — fine).
**Consequences:** engine chunk ships inside `out/` (M5 packaging: node_modules needed only for photon-node). Typecheck uses a local stub for `pi-mcp-adapter` (tsconfig `paths` redirect — its raw-TS types entry would drag the whole source graph, incl. an uninstalled peer, into our strict check; builds are unaffected since Vite doesn't read tsconfig paths).

## D15 — Product data surfaces: conversations = pi sessions per site; site list via a direct official-MCP-SDK client in the engine.

**Context (2026-09-18, M4 C1):** M4 needs (a) a multi-conversation switcher per site — the user explicitly wants switching between chats/conversations, not one active session — and (b) a site list for the picker. Online verification (pi.dev SDK docs + installed `.d.ts`, 2026-09-18): `SessionManager.list(cwd)` returns rich `SessionInfo` (`path/id/name?/firstMessage/modified/messageCount`), and `.open(path)` / `.continueRecent(cwd)` / `.create(cwd)` cover switch/resume/new; since our per-site `cwd = <userData>/work/<siteId>`, scoping by site is automatic. For the site list, `pi-mcp-adapter`'s programmatic `executeCall` needs the internal `McpExtensionState` (deep-importing internals is fragile — R2-adjacent), so a session-independent path is required.
**Choices:**
1. **Conversations = pi session files per site.** `open-session { websiteId, sessionPath?, fresh? }`: default resumes the most recent conversation (`continueRecent`), `fresh: true` starts a new one (`create`), `sessionPath` switches (`open(path)` — validated engine-side to resolve strictly inside `<userData>/work/<websiteId>`; renderer input is untrusted). After any open, the engine replays the stored transcript as a bounded `history` event (`HISTORY_MAX_MESSAGES` 500, text truncated at 20 k chars, tool results folded into their call with the same preview truncation as live events) so the renderer rebuilds without persisting a second transcript. `list-sessions { websiteId }` returns renderer-safe `ConversationSummary`s (auto-title `name ?? firstMessage`, ordered by `modified`). Titles v1 are auto-derived; custom naming is backlog.
2. **Site picker = official `@modelcontextprotocol/sdk` 1.30.0 (exact pin) client in the engine.** `list_websites` + per-site `get_website` (dev/default env URLs for preview/live) through a short-lived client (connect → calls → close) with the bearer read from `PW_ACCESS_TOKEN` — the same env main keeps rotated (`token-updated`). The SDK glue is thin; pure parsers (`parseWebsiteList`, `parseWebsiteDetail`, `extractToolJson`) are the tested surface and degrade defensively (a failing `get_website` drops URLs, never the row).
**Rejected:** proxying site data through agent prompts (non-deterministic, token-costly, wrong layer); deep-importing `pi-mcp-adapter` internals for `executeCall` (internal state contract, breaks silently across adapter releases); a REST client in main (violates "MCP is the only data plane"); renderer-held transcript persistence (dual source of truth, drift); renderer-side MCP client (secrets in renderer — forbidden).
**Consequences:** engine chunk grows ~60 KB (MCP SDK); renderer builds conversation UIs purely from engine events + `list-sessions`; the site list refreshes on picker open and on `create_website` tool events (C2). The debug scope (`DEBUG_WEBSITE_ID`) now also resumes its last conversation instead of spawning a new file on every model sync — fewer orphan session files.

## D16 — Product chat: stream-md renderer, shared external-URL allowlist, menu-toggled debug console.

**Context (2026-09-18, M4 C3):** The product chat renders token-streamed markdown, tool cards, and confirmation URLs. Two facts from online verification (2026-09-18): plain `react-markdown` re-parses the whole document per token (O(n²), flicker — confirmed across multiple 2026 benchmarks), and the 2026 streaming-renderer field offers several incremental alternatives. Our renderer has a strict CSP (`script-src 'self'`, no inline styles beyond React's emitted attributes).
**Choices:**
1. **stream-md 0.2.0 (exact pin, MIT) for assistant text.** Incremental block parser (closed blocks freeze via memoization), speculative inline close, GFM built-in, URL sanitizer default, **CSP-safe (no inline styles)**, ~10 KB gz, React 19. Imported styles via `@import "stream-md/styles.css"` in the CSS-first index.css. Fallback if it disappoints (0.x dep): block-memoized react-markdown — the spike validated install, exports, and build; runtime behavior gets exercised in the live acceptance run and E2E.
2. **One shared external-URL allowlist** (`src/shared/confirm-urls.ts`, pure): https-only, host = `pageweave.dev` or `*.pageweave.site`/`*.pageweave.dev`, no credentials in URL. Used by THREE surfaces: main's `app:openExternal` IPC handler (renderer request), main's `will-navigate` fence (chat markdown links route to the system browser instead of dead-clicking), and the renderer's own confirmation-card detection in tool outputs (`extractConfirmUrl`).
3. **Debug console = hidden diagnostics behind the menu.** App menu "View → Debug Console" with standard accelerator **Cmd/Ctrl+Shift+D** pushes `debug:toggle` to the renderer (sandboxed renderers don't own global menu accelerators; main owns the menu). The product chat owns the center pane by default; the debug console (with the model-connect form) renders over it while toggled — it remains the acceptance-run and support tool.
4. **Transcript logic is a pure reducer** (`src/renderer/src/components/chat-entries.ts`): engine events → entries, tested in node Vitest (73 tests). History backfill rebuilds entries from the D15 `history` event. Vitest Browser Mode component tests arrive with the interaction-heavy C4/C5 work (renderer-ui skill's M4 decision — jsdom remains rejected).
**Rejected:** raw `react-markdown` for streaming (O(n²) re-parse per token); rendering agent text as raw HTML (XSS class); opening arbitrary URLs from the renderer (allowlist must match main's); keyboard shortcut handled in the renderer (unreliable focus, main owns menus).
**Consequences:** renderer bundle +~70 KB min (stream-md); tool cards carry "Review & confirm ↗" buttons for workflow URLs — the acceptance run validates the real URL shape (regex may need a follow-up amendment).

**(C4 addendum)** The preview pane is a main-process `WebContentsView` (`persist:pw-preview` partition: the dev env's password cookie survives restarts — entered once manually, no auth injection), sandboxed, no preload, deny-all permissions, window-open denied, navigation fenced by the shared allowlist. The renderer reserves the right pane and reports its rect over IPC (`preview:setBounds` — validated in main before `setBounds`); debounced (2 s) auto-refresh fires on successful content-mutation tool events.
