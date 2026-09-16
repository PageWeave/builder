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
