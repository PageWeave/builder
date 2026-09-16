# ARCHITECTURE.md — PageWeave Builder

## Process model (Electron)

Three processes, strictly separated:

### 1. Main process (`src/main/`)

Owns everything privileged:

- **OAuth sign-in**: opens the system browser at the PageWeave authorize URL (public client, PKCE), listens on `http://127.0.0.1:<random-port>/callback` for the redirect, exchanges the code. Token refresh handled here. See SPEC-PLATFORM.md § OAuth.
- **Secret storage**: OAuth access/refresh tokens and provider API keys via Electron `safeStorage` (OS keychain). Nothing secret ever crosses to the renderer.
- **Engine lifecycle**: spawns/kills the utility process, passes config (token, model choice, website context) at spawn or via MessagePort messages. Restarts on crash with backoff.
- **Auto-update** (M5): `electron-updater` against a feed hosted by PageWeave.
- **Windows/menu/tray**, file dialogs (v1: none planned), external URL opening (`shell.openExternal` for confirmation workflow URLs, docs links).
- **App metadata**: product name "PageWeave Builder", app id (`dev.pageweave.builder` — CONFIRM reverse-DNS scheme), userData dir layout.

### 2. Renderer (`src/renderer/`, React + Tailwind)

Sandboxed, no Node. Talks only to the typed bridge (`src/preload/`). Views:

- **Chat** — streaming markdown responses, tool-call cards (collapsed by default: tool name + title + status), confirmation cards (server-side workflow URLs → "Open approval page" button via `shell.openExternal`), error toasts, abort button.
- **Site picker** — list of the user's websites (data via engine → MCP `list_websites`), create-new-site flow (M4: guided prompt into chat rather than a form — the agent creates it via MCP).
- **Preview pane** — loads the selected site's **dev environment** URL (`https://<subdomain>.env.pageweave.site/`) in a `WebContentsView` (separate session partition). Refreshes when the engine reports page/snippet/component-changing tool completions. Live-reload is already on for dev envs server-side.
- **Model connect** (first-run + settings): provider picker (Anthropic, OpenAI, Google, OpenRouter, custom OpenAI-compatible baseURL+model), key input → stored via main → `safeStorage`. Never persisted in renderer state beyond the session.

### 3. Utility process "engine" (`src/engine/`)

Hosts the agent as plain Node libraries:

```ts
// Sketch — exact API per pi SDK docs at time of M3
import { createAgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createMcpAdapter } from "pi-mcp-adapter";

const mcp = createMcpAdapter({
  mcpServers: {
    pageweave: {
      type: "http",                       // streamable-http transport
      url: "https://pageweave.dev/mcp",   // CONFIRM exact endpoint (SPEC-PLATFORM §MCP)
      headers: { authorization: `Bearer ${token}` },
      lifecycle: "eager",
      // directTools: true vs "search" — decide at M3 by measuring context cost
      // (~45 tools, PageWeave keeps descriptions lean)
    },
  },
});

const { session } = await createAgentSession({
  model,                                   // from BYOK connect flow
  tools: ["read"],                         // minimal local tools; NO edit/write/bash in v1
  sessionManager: SessionManager.create(pathInUserData("sessions")),
  resourceLoader,                          // bundles PageWeave skills (below)
  systemPromptOverride: pageWeaveBuilderPrompt,
});
```

- **System prompt** (`src/engine/prompt.ts`): the PageWeave Builder agent instructions — how to build sites via the MCP tools, design guidance links (https://pageweave.dev/docs.md, /docs/design.md, /docs/liquid.md, /docs/i18n.md), when to ask vs act, confirmation-card behavior. Versioned in repo.
- **Skills**: bundle the PageWeave SKILL.md set (site-building, Liquid reference, design) into the app-managed agent dir; loaded via the resource loader, never from `~/.pi` (we own the whole environment).
- **Events → UI**: subscribe to session events (text deltas, tool call start/end, errors); forward over MessagePort → main → renderer. Render from these events only; renderer never talks to MCP or providers directly.
- **Per-website sessions**: one Pi session per (website, conversation). Switching site = switching session, `website` param is already handled inside every MCP tool call.

## Data flows

| Flow | Path |
|---|---|
| Sign in | renderer → main → system browser → loopback → main (token) → safeStorage |
| Prompt | renderer → IPC → main → MessagePort → engine `session.prompt()` |
| Streaming | engine events → MessagePort → main → IPC → renderer |
| Tool call (e.g. `update_page`) | engine → MCP adapter → HTTPS → PageWeave Rails → result → engine → (event) → renderer card + preview refresh hint |
| Confirmation needed | MCP tool returns workflow URL → confirmation card → user clicks → `shell.openExternal` (browser, 6h expiry) |
| Model call | engine → pi-ai → provider API with user's key |

## Security posture

- Renderer sandbox on, `contextIsolation` on, `nodeIntegration` off, strict CSP.
- OAuth token scope: `read write` (coarse; MCP tools derive their own checks from that). No token in renderer, logs, or crash dumps.
- Provider keys: per-user, `safeStorage`, never synced anywhere.
- Preview `WebContentsView`: own session partition, no Node, navigation locked to `*.pageweave.site` + `pageweave.dev` approval hosts.
- External links open in the user's browser, never in-app navigation.

## Key packages (pin exact versions)

| Package | Role |
|---|---|
| `@earendil-works/pi-coding-agent` | Engine: agent session, loop, compaction, sessions, skills loader (ex `@mariozechner/*` — see RESEARCH.md) |
| `@earendil-works/pi-ai` | Multi-provider LLM access (used transitively; we touch it for custom OpenAI-compatible providers) |
| `pi-mcp-adapter` | MCP client for Pi; `createMcpAdapter` = isolated embedded config, bearer headers, streamable-http |
| `electron`, `electron-vite`, `electron-builder` | Shell, dev, packaging |

## Deliberately NOT included

- OpenCode (any form) — see DECISIONS D3
- Local file-editing/bash tools for the agent (v1; site edits happen via MCP)
- Subagents/plan mode (Pi doesn't have them; not needed for v1 scope)
- Any PageWeave-hosted LLM relay (M6+; DECISIONS D5)
