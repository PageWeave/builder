# AGENTS.md — PageWeave Builder repo

Rules for AI agents working in this repository.

## Read first

1. `PLAN.md` — status + direction. It is the source of truth. If reality and PLAN.md disagree, fix PLAN.md in the same change.
2. `docs/DECISIONS.md` before changing any locked decision. Locked decisions are not style preferences; supersede by appending a new decision, never edit history.
3. `docs/ARCHITECTURE.md` — process model and security posture; required reading before any code work.
4. `docs/SPEC-PLATFORM.md` for integration facts (MCP endpoint, OAuth, scopes) and open CONFIRM items.
5. `docs/RESEARCH.md` — findings already researched with sources; don't re-research what it covers, but re-verify dated facts.

## Repo state

M1 done (2026-09-16): Electron skeleton + CI live at `github.com/PageWeave/builder` (private). `npm run dev|build|lint|typecheck|test` all exist and are green. Stack exact-pinned per DECISIONS D12: electron 44, electron-vite 5 + vite 7 (NOT 8), TypeScript 5.9 (NOT 7), React 19, Tailwind 4 + daisyUI 5, vitest 5, eslint 10. `src/engine/` is a ping/pong stub — pi packages (`@earendil-works/*`, `pi-mcp-adapter`) are NOT installed until M3. Agent skills live in `.opencode/skills/` (read the relevant one before touching its area). CI runs verify + xvfb boot smoke + gitleaks on every push; Dependabot is configured with wave-locked major ignores.

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
