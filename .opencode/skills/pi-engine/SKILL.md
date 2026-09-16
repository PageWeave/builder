---
name: pi-engine
description: Embedding the Pi agent harness in this repo's utility process — @earendil-works/pi-coding-agent createAgentSession, pi-mcp-adapter createMcpAdapter with Bearer auth to PageWeave's MCP server, engine isolation rules, pinned engine versions, scope-rename churn, event bridge to renderer. Use when working in src/engine/, adding/upgrading any @earendil-works/* or pi-mcp-adapter dependency, wiring MCP tools, engine events, sessions, skills, or the system prompt (M3).
---

# Pi engine embedding (M3)

Read first: `docs/ARCHITECTURE.md` § Utility process, `docs/DECISIONS.md` D3 + D10, `docs/RESEARCH.md` § 1, `docs/SPEC-PLATFORM.md` § MCP server.

## Isolation rules (R2 mitigation — non-negotiable)

- **ALL `@earendil-works/*` and `pi-mcp-adapter` imports live behind `src/engine/`.** Main and renderer never import engine packages. Main knows only the MessagePort envelope (`src/shared/ipc.ts` + M3's `src/shared/engine-events.ts`).
- Engine deps are **pinned exact** in package.json. Upgrades are deliberate, tested changes — the upstream renamed scopes once already (`@mariozechner/*` → `@earendil-works/*`); old docs/blog posts still reference the old scope. If a package drifts or breaks, vendor it into `vendor/` (pi-mcp-adapter is MIT and small) rather than blocking.
- Versions verified 2026-09-16 (re-verify at M3): `@earendil-works/pi-coding-agent` 0.85.1, `@earendil-works/pi-ai` 0.85.1, `pi-mcp-adapter` 2.34.0. SDK docs: https://pi.dev/docs/latest/sdk — **confirm exact API shapes against current docs at implementation time; sketches in repo docs are from M0 research.**

## Session shape (per ARCHITECTURE sketch)

- `createAgentSession({ model, tools: ["read"], sessionManager, resourceLoader, systemPromptOverride })`.
- Local tools: `read` ONLY. No edit/write/bash — site edits go through MCP (D10). Do not widen this without a DECISIONS entry.
- `SessionManager` storage under userData (`app.getPath('userData')/sessions`) — never `~/.pi`; we own the whole environment. One Pi session per (website, conversation); site switch = session switch.
- System prompt: `src/engine/prompt.ts`, versioned in repo (PageWeave Builder agent instructions — MCP-tool workflow, docs links, when to ask vs act, confirmation-card behavior).
- Bundled PageWeave skills (SKILL.md set from SPEC-PLATFORM § Agent knowledge sources) via the resource loader — never from `~/.pi` or user dirs.

## MCP wiring

- `createMcpAdapter({ mcpServers: { pageweave: { type: 'http', url, headers: { authorization: 'Bearer <token>' }, lifecycle: 'eager' } } })` — the isolated programmatic config for embedded hosts; do NOT read user-level `.mcp.json`.
- Endpoint: `https://pageweave.dev/mcp` is a **CONFIRM item** (SPEC-PLATFORM) — verify against the Rails routes before M3 wires it.
- Bearer token arrives from main (safeStorage) via spawn config / init message. The engine must never log it and never forward it to the renderer.
- **`directTools: true` vs `"search"` is a measured M3 decision**: ~45 tools with lean descriptions; measure context cost both ways with the real server, record in DECISIONS.md.
- App must tolerate unknown tools server-side (platform bumps its MCP server version independently).

## Event bridge

- Subscribe to session events (text deltas, tool-call start/end, errors, confirmation/workflow URLs) → forward over MessagePort → main → renderer as typed envelopes (`src/shared/engine-events.ts`). Renderer renders ONLY from these events.
- Confirmation workflow URLs surface as events → confirmation cards (D10) → `shell.openExternal` (browser, 6h expiry).

## Engine ↔ main lifecycle

- Spawn config (model choice, token, website context) via init MessagePort message at boot; engine replies `ready` (see M1's engine-host pattern: requestId correlation, timeout wrap, crash restart with backoff).
- Compaction is Pi-internal; make sure a long session with compaction survives the event bridge (M3 acceptance covers this).

## Red flags

- `@earendil-works/*` imports outside `src/engine/`.
- Floating (`^`) engine versions or casual `npm update`.
- Token/key in engine logs, error messages, or renderer-bound events.
- Writing to `~/.pi` or reading user-level MCP/skill config.
- Building a parallel REST client for website data — MCP is the only data plane (SPEC-PLATFORM).

## Sources

- Pi SDK docs: https://pi.dev/docs/latest/sdk; repo: github.com/earendil-works/pi (MIT)
- pi-mcp-adapter: https://pi.dev/packages/pi-mcp-adapter (createMcpAdapter, bearer interpolation, directTools modes)
- Embedding precedent: OpenClaw https://open-claw.bot/docs/platforms/pi/
- docs/RESEARCH.md § 1 (full candidate analysis + rename history)
