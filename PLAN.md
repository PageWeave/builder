# PLAN.md — PageWeave Builder Master Plan

Entry point for any agent (or human) picking up this project. Keep this file updated as the source of truth for status and direction. Last updated: 2026-09-16 (M1).

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
| M2 — Auth (OAuth, token storage, website list) | ⬜ next |
| M3 — Engine (Pi + MCP adapter, BYOK UI, debug console) | ⬜ |
| M4 — Product UI (chat, site picker, preview) | ⬜ |
| M5 — Ship (signing, notarization, auto-update, installers) | ⬜ |
| M6+ — Gateway, Linux, publish/feedback UI | ⬜ |

Full breakdown with acceptance criteria: [docs/MILESTONES.md](docs/MILESTONES.md).

## Next actions (for the agent starting M2)

1. Read `docs/DECISIONS.md` (D12 = toolchain pins), `docs/ARCHITECTURE.md`, `docs/SPEC-PLATFORM.md` § OAuth.
2. **Unblock M2 first:** the desktop OAuth client registration is a platform-side task (SPEC-PLATFORM § Platform-side tasks #1) and blocks M2 — surface to the user; also resolve the loopback-redirect and refresh-token CONFIRM items against the Rails app.
3. Implement M2 per `docs/MILESTONES.md` (OAuth module in main, safeStorage, signed-in/out states). Start from the `oauth-pkce` skill in `.opencode/skills/`.
4. M3 note: `externalizeDepsPlugin` vs bundling pi into the engine chunk is a decision recorded as deferred in D12 — measure at M3.

## Non-goals (v1)

- No PageWeave-hosted model gateway (M6+)
- No publish/feedback/domain management UI
- No Linux builds (macOS + Windows first)
- No subagents, no plan mode, no local file editing tools exposed to the agent
- No telemetry/analytics in the app (PageWeave privacy positioning: server-side only, EU)
