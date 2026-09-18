# AGENTS.md — PageWeave Builder repo

Rules for AI agents working in this repository.

## Read first

1. `PLAN.md` — status + direction. It is the source of truth. If reality and PLAN.md disagree, fix PLAN.md in the same change.
2. `docs/DECISIONS.md` before changing any locked decision. Locked decisions are not style preferences; supersede by appending a new decision, never edit history.
3. `docs/ARCHITECTURE.md` — process model and security posture; required reading before any code work.
4. `docs/SPEC-PLATFORM.md` for integration facts (MCP endpoint, OAuth, scopes) and open CONFIRM items.
5. `docs/RESEARCH.md` — findings already researched with sources; don't re-research what it covers, but re-verify dated facts.

## Repo state

M4 C1 done (2026-09-18): conversation surfaces (resume/switch/fresh open-session, list-sessions, history backfill) + engine-side official-MCP-SDK site client (list_websites/get_website, D15). M3 remains the last full milestone — engine live on top of M1+M2 — pi packages exact-pinned (`@earendil-works/pi-coding-agent` 0.85.1, `pi-ai` 0.85.1, `pi-tui` 0.85.1, `pi-mcp-adapter` 2.34.0), ALL imports confined to `src/engine/` (R2). Embedding per D14: `ModelRuntime` + `InMemoryCredentialStore` (BYOK keys in memory only, safeStorage in main), MCP via `createMcpAdapter` isolated config (bearer via `${PW_ACCESS_TOKEN}` env interpolation, lazy lifecycle, `directTools: true` + `freezeDirectTools`), token rotation via main→engine `token-updated` push, per-website sessions under `<userData>/work/<siteId>` with `PI_CODING_AGENT_DIR=<userData>/agent` (never `~/.pi`), bundled skills (`npm run sync:docs` → `src/engine/resources/skills/`), engine chunk bundled single-file (`externalizeDeps: false` + `inlineDynamicImports`, 15 MB — adapter ships raw TS, externalizing is impossible). Debug chat console in renderer; 49 tests; CI green. Live acceptance run (model key + account) still pending — PLAN.md § Next actions. `pi-mcp-adapter` is typecheck-stubbed via tsconfig `paths` (raw-TS types entry). Agent skills in `.opencode/skills/` — read the relevant one before touching its area.

## What this project is

An Electron desktop app (**PageWeave Builder** — final name, D8) embedding the Pi agent harness as libraries, talking to PageWeave's remote MCP server. Users are **non-technical** — every UX decision is judged by "could my parent use this?"

## Language & docs

- English only in this repo (code, docs, commits, issues).
- Keep `docs/` current with every meaningful change: new decision → append to `docs/DECISIONS.md`; milestone state changed → update table in `PLAN.md`; new integration fact confirmed → update `docs/SPEC-PLATFORM.md` and remove the CONFIRM flag.
- Docs are written for **a fresh agent with zero context**. Explain the why, link sources.

## Sibling repo

`~/dev/pageweave` is the PageWeave Rails platform (dashboard, MCP server, OAuth provider). Its `AGENTS.md` governs that repo. Do not make platform changes from this session without explicit user approval; instead add the task to `docs/SPEC-PLATFORM.md` § "Platform-side tasks".

## Code conventions (apply from M1 on)

- Scaffold (MILESTONES M1): `electron-vite` + React + Tailwind 4, TypeScript strict everywhere; layout `src/{main,renderer,preload,engine,shared}`. Shared types for all IPC contracts in one place (`src/shared/`).
- Renderer is sandboxed: **no Node access in renderer**, all capabilities via typed `contextBridge` API. No inline scripts; CSP strict.
- **Secrets (OAuth tokens, provider API keys) never enter the renderer process.** Main process + `safeStorage` only. Engine receives them via utility-process spawn args/IPC, never via the renderer.
- Engine (Pi) runs in a **utility process**, not the main process. Keep the engine surface narrow: one module that owns session creation, MCP adapter config, and event forwarding — isolate ALL `@earendil-works/*` imports behind `src/engine/` (RISKS R2).
- Pin exact versions of engine dependencies (`@earendil-works/*`, `pi-mcp-adapter`) in package.json; upgrades are deliberate, tested changes (upstream renamed package scopes once already — see RESEARCH.md).
- Vendoring escape hatch: if `pi-mcp-adapter` drifts or breaks, vendor it into `vendor/` (it's MIT, small) rather than blocking.
- No telemetry, no analytics, no crash reporting in v1. Privacy is a product feature.
- Testing: Vitest for unit (engine wiring, IPC contracts, auth flows), Playwright (`_electron`) for smoke E2E from M4. New features land with tests.
- Commits: Conventional Commits, short subject. Never commit secrets. Never push unless asked.

## Definition of done (any milestone)

- Acceptance criteria in `docs/MILESTONES.md` met
- `npm run lint && npm run typecheck && npm run test` green
- `PLAN.md` status table updated
- Docs updated if decisions/facts changed
