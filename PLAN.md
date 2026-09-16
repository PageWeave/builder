# PLAN.md — PageWeave Builder Master Plan

Entry point for any agent (or human) picking up this project. Keep this file updated as the source of truth for status and direction. Last updated: 2026-09-17 (M2).

## Vision

Non-technical people should be able to build and iterate on a PageWeave website by chatting with an agent in a native app. Onboarding: **download → sign in → pick site → chat.** The agent runs **locally on the user's machine** (harness-grade loop, no long-lived LLM streams on PageWeave servers); all site mutations go through PageWeave's existing MCP tool surface (short request/response calls).

Product name: **PageWeave Builder**. Internal codename history: `pageweave-creator` (rejected — Meta's "Creator Studio" relaunch + creator-economy connotation; see DECISIONS D8).

## Architecture summary

```
┌─ PageWeave Builder (Electron) ──────────────────────────────┐
│ Renderer (React, sandboxed)                                 │
│   chat UI · site picker · preview pane · model connect      │
│      ↕ typed IPC (contextBridge)                            │
│ Main process                                                │
│   OAuth (system browser + loopback, PKCE) · safeStorage     │
│   engine lifecycle · auto-update · window mgmt              │
│      ↕ MessagePort                                          │
│ Utility process "engine"                                    │
│   Pi: createAgentSession() + systemPromptOverride           │
│   MCP: pi-mcp-adapter createMcpAdapter → pageweave.dev      │
│        (streamable-http, Bearer <oauth token>)              │
│   Skills: bundled PageWeave SKILL.md set                    │
│   Models: pi-ai providers, BYOK keys from safeStorage       │
└─────────────────────────────────────────────────────────────┘
        │ short MCP JSON-RPC calls            │ LLM streams (user's key)
        ▼                                     ▼
   PageWeave Rails (pageweave.dev)      Anthropic/OpenAI/Google/OpenRouter/…
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Locked decisions (do not revisit without reading DECISIONS.md)

1. **Embed, never fork** any harness — no merge burden, we own 100% of UI/branding
2. **Engine = Pi** (`@earendil-works/pi-coding-agent`), not OpenCode. OpenCode remains the power-user path via our MCP server, independent of this app
3. **Shell = Electron**, not Tauri (entire core is a Node backend; Tauri sidecar complexity buys nothing here)
4. **Agent runs locally**; PageWeave servers never hold agent loops
5. **Models v1 = BYOK** via in-app guided connect flow. PageWeave-hosted LLM gateway = M6+
6. **UI v1 = chat + site picker + preview** only. No publish/feedback/domains UI
7. **Auth = PageWeave OAuth** (public client, PKCE); token authorizes MCP calls
8. Destructive-action safety v1 = PageWeave's server-side workflow confirmations rendered as cards; no custom permission engine

## Status

| Milestone | State |
|---|---|
| M0 — repo + planning docs | ✅ done |
| M1 — Electron skeleton + CI | ✅ done (2026-09-16) |
| M2 — Auth (OAuth, token storage) | ✅ done (2026-09-17) — real-browser sign-in round-trip pending user acceptance run |
| M3 — Engine (Pi + MCP + BYOK) | ⬜ next |
| M3 — Engine (Pi + MCP adapter, BYOK UI, debug console) | ⬜ |
| M4 — Product UI (chat, site picker, preview) | ⬜ |
| M5 — Ship (signing, notarization, auto-update, installers) | ⬜ |
| M6+ — Gateway, Linux, publish/feedback UI | ⬜ |

Full breakdown with acceptance criteria: [docs/MILESTONES.md](docs/MILESTONES.md).

## Next actions (for the agent starting M3)

1. Read `docs/DECISIONS.md` (D12 pins, D13 auth), `docs/ARCHITECTURE.md`, then the `pi-engine` + `electron-ipc` skills.
2. Add engine deps exact-pinned (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `pi-mcp-adapter` — re-verify current versions + API shapes against https://pi.dev/docs/latest/sdk first; see `docs/RESEARCH.md` § 1). Decide `externalizeDepsPlugin` vs bundling pi into the engine chunk by measurement; record in DECISIONS.
3. Wire MCP: `createMcpAdapter` with `https://pageweave.dev/mcp` + Bearer from `AuthController.getAccessToken()`; token push to engine on refresh (R9). Measure `directTools: true` vs `"search"` context cost with the real ~45-tool server; record in DECISIONS.
4. Website list (deferred from M2) surfaces via the engine's `list_websites`.
5. BYOK: model-connect UI → safeStorage → engine; event bridge → `src/shared/engine-events.ts` typed envelopes; debug chat console for the M3 acceptance loop.
6. Deferred user acceptance: real-browser sign-in round-trip of M2 (`npm run dev` on a display machine).

## Non-goals (v1)

- No PageWeave-hosted model gateway (M6+)
- No publish/feedback/domain management UI
- No Linux builds (macOS + Windows first)
- No subagents, no plan mode, no local file editing tools exposed to the agent
- No telemetry/analytics in the app (PageWeave privacy positioning: server-side only, EU)
