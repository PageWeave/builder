---
name: pi-engine
description: Embedding the Pi agent harness in this repo's utility process (M3, implemented) — createAgentSession + ModelRuntime with in-memory BYOK keys, pi-mcp-adapter createMcpAdapter isolated config with env-interpolated bearer, per-website sessions, bundled skills, event bridge, single-file bundled engine chunk. Use when working in src/engine/, touching any @earendil-works/* or pi-mcp-adapter dependency, wiring MCP tools, engine events, sessions, skills, or the system prompt.
---

# Pi engine embedding (implemented in M3)

Read first: `docs/DECISIONS.md` D14, `src/engine/session.ts` (the owner), `docs/SPEC-PLATFORM.md` § MCP server.

## Verified versions (exact pins, checked 2026-09-18)

`@earendil-works/pi-coding-agent` 0.85.1 · `@earendil-works/pi-ai` 0.85.1 · `@earendil-works/pi-tui` 0.85.1 · `pi-mcp-adapter` 2.34.0. The scope was renamed once (`@mariozechner/*` → `@earendil-works/*`) — old posts/docs reference it. **pi-tui is now OUR direct dep** (adapter peer; pi-coding-agent no longer carries it). Upgrades are deliberate, tested changes; vendor `pi-mcp-adapter` into `vendor/` if it drifts (MIT, small).

## Isolation rules (R2 mitigation — non-negotiable)

- **ALL `@earendil-works/*` and `pi-mcp-adapter` imports live behind `src/engine/`.** Main/renderer never import them. `pi-mcp-adapter` resolves to a typecheck stub via tsconfig.node `paths` (its package "types" entry is raw TS — real resolution would drag its source graph into our strict typecheck). Vite does NOT read tsconfig paths, so builds bundle the real package.
- **The engine chunk must stay bundled**: `electron.vite.config.ts` main build has `externalizeDeps: false` + `inlineDynamicImports: true`. Externalizing crashes at runtime (adapter entry is raw TS; Node refuses type-stripping under node_modules), and code-split chunks broke the `__filename` shim (TDZ). Chunk ≈ 15 MB — that's the accepted cost (D14).

## Session shape (as implemented in `src/engine/session.ts`)

```ts
const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore() })
await runtime.setRuntimeApiKey(provider, apiKey) // runtime-only, never persisted
const loader = new DefaultResourceLoader({
  cwd,                    // <userData>/work/<websiteId>
  agentDir,               // <userData>/agent (PI_CODING_AGENT_DIR env set at runner creation)
  settingsManager,        // SettingsManager.inMemory()
  systemPromptOverride: () => buildSystemPrompt(),
  agentsFilesOverride: () => ({ agentsFiles: [] }),   // never ambient AGENTS.md
  extensionFactories,     // [createMcpAdapter({ config }), customProvider?]
})
const { session } = await createAgentSession({
  cwd, agentDir, model, modelRuntime: runtime,
  tools: ['read', 'grep'],             // read-only (D10 + D14 spill-file amendment)
  sessionManager: SessionManager.create(cwd),
  settingsManager, resourceLoader: loader,
})
session.subscribe((event) => forward(mapSessionEvents(event)))  // returns unsubscribe
```

- BYOK built-ins (anthropic/openai/google/openrouter): key arrives via main's `configure` message → `setRuntimeApiKey`. Custom OpenAI-compatible: inline extension calls `pi.registerProvider('pw-custom', { baseUrl, apiKey, api: 'openai-completions', models: [...] })`; the `Model` object is constructed literally (contextWindow 128k, maxTokens 8192 defaults).
- Model lists for the connect UI: `runtime.getAvailable()` filtered by provider (`model:list` request).
- One session per website; re-configure (model change) closes the active session; main re-opens. Engine crash → EngineHost replays configure + open-session.

## MCP wiring (as implemented in `src/engine/mcp-config.ts`)

```ts
createMcpAdapter({
  config: {
    mcpServers: {
      pageweave: {
        url: 'https://pageweave.dev/mcp',
        auth: 'bearer',
        bearerToken: '${PW_ACCESS_TOKEN}',  // env-interpolated at CONNECT time
        lifecycle: 'lazy',                  // short-lived connections
        directTools: true,                  // D14; measure vs 'search' in acceptance
        requestTimeoutMs: 120_000,
      },
    },
    settings: { freezeDirectTools: true, sampling: false, elicitation: false, scriptMode: true, requestTimeoutMs: 120_000 },
  },
})
```

- **Token rotation**: config is an immutable snapshot — a literal token would die at the 1 h expiry. Main pushes `token-updated` → engine sets `process.env.PW_ACCESS_TOKEN` → each NEW connection re-interpolates. Lazy lifecycle keeps connections short; a connection alive across the expiry mark 401s once, then reconnects fresh.
- Isolated `createMcpAdapter({ config })` never reads user `.mcp.json` / `~/.config/mcp` — verified in adapter source.
- Sampling/elicitation are OFF: no embedded UI in v1 to answer those dialogs. `mcpScript` stays on (bulk operations).
- Direct tools register from the metadata cache (`<agentDir>/mcp-cache.json` via PI_CODING_AGENT_DIR) — first session after install is proxy-only until the cache populates, then hot-loads.

## Event bridge

`mapSessionEvents()` in `src/engine/events.ts` is the ONLY path from pi events to the renderer: typed, secret-free envelopes (`src/shared/engine-events.ts`), defensive against upstream shape changes (unknown events degrade to a status line). Tool results are truncated to `TOOL_OUTPUT_PREVIEW_MAX_CHARS`. Confirmation workflow URLs arrive inside tool results (server-side confirmations per D10) — M4 renders them as cards.

## Engine ↔ main protocol

Engine requests (requestId-correlated): ping · configure · token-updated · open-session · prompt · steer · abort · list-models. Per-kind timeouts in EngineHost (ping 5 s … configure/open-session/list-models 60 s; prompt responds on ACCEPTANCE — completion arrives as events). One-way notices: `{ kind: 'ready' }`, `{ kind: 'event', event }`. Paths (`agentDir`, `workDir`) ride the init envelope; secrets ride only in `configure`/`token-updated` payloads — never spawn args (ps-visible), never in logs.

## Red flags

- `@earendil-works/*` / `pi-mcp-adapter` imports outside `src/engine/`.
- Floating (`^`) engine versions or casual `npm update`; forgetting pi-tui on a fresh install.
- Re-enabling `externalizeDeps` or removing `inlineDynamicImports` on the main build.
- Token/key in engine logs, error messages, renderer-bound events, or spawn args; a literal token in the adapter config.
- Writing to `~/.pi` or reading user-level MCP/skill config (PI_CODING_AGENT_DIR + explicit agentDir keep us clean).
- Importing `session.ts` into vitest tests (it loads the real pi graph — test the pure modules instead: events, mcp-config, skills, prompt).
- Building a parallel REST client for website data — MCP is the only data plane.

## Sources

- Pi SDK docs: https://pi.dev/docs/latest/sdk (verified 2026-09-18; `ModelRuntime`, `DefaultResourceLoader` options, `SessionManager` factories, event list)
- pi custom providers: `@earendil-works/pi-coding-agent` `docs/custom-provider.md` (npm package)
- pi-mcp-adapter 2.34.0: package README + `dist/types.d.ts` + source (unpkg/jsdelivr) — createMcpAdapter snapshot semantics, bearer interpolation timing, output guard, lifecycle modes
- Embedding precedent: OpenClaw https://open-claw.bot/docs/platforms/pi/
