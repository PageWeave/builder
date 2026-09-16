# RESEARCH.md — Condensed research findings with sources

Done 2026-09-16 via web research so future sessions don't re-research. Facts are as-of date; re-verify anything older than a few months before relying on version numbers.

## 1. Embeddable harness candidates

### Pi (CHOSEN — see DECISIONS D3)
- Repo: `github.com/earendil-works/pi` (formerly `badlogic/pi-mono`). MIT. ~93.8k★, 220+ contributors, 228+ releases. Core team: badlogic (Mario Zechner, libgdx author), mitsuhiko (Armin Ronacher) is #2 contributor.
- Packages: `@earendil-works/pi-ai` (multi-provider LLM), `pi-agent-core` (loop/tools), `pi-coding-agent` (full SDK: `createAgentSession`, SessionManager, SettingsManager, skills/ResourceLoader, `systemPromptOverride`, custom tools, `streamFn` middleware), `pi-tui` (not needed — we have our own UI).
- **Package rename history**: `@mariozechner/*` → `@earendil-works/*`. Old docs/blog posts reference the old scopes.
- Embedding precedent: **OpenClaw** (multi-channel consumer agent product) embeds pi exactly the way we will: https://open-claw.bot/docs/platforms/pi/ and https://nader.substack.com/p/how-to-build-a-custom-agent-framework
- SDK docs: https://pi.dev/docs/latest/sdk
- Deliberate omissions: no MCP, no subagents, no plan mode, no built-in todo/permission system (minimal-by-design; extensions cover gaps).

### Pi MCP adapters (third-party, MIT)
- **`pi-mcp-adapter`** (CHOSEN): https://pi.dev/packages/pi-mcp-adapter — streamable-http/SSE/stdio, bearer headers (`authorization: Bearer ${ENV_VAR}` interpolation), OAuth for MCP servers, `directTools: true | "search"` modes, **`createMcpAdapter`** = isolated programmatic config snapshot for SDK embeddings (exactly our case), reads standard `.mcp.json`/`~/.config/mcp/mcp.json` shapes, MCP protocol negotiation options.
- Alternatives: `pi-mcp-extension` (https://pi.dev/packages/pi-mcp-extension, ~11.6k dl/mo, MCP 2025-03-26 compliant), `@0xkobold/pi-mcp` (also usable as standalone library).

### OpenCode (rejected for embedding — remains our power-user ecosystem partner)
- Repo: `github.com/anomalyco/opencode` (ex `sst/opencode`). MIT. ~203k★, 950 contributors, default branch `dev`, **V1→V2 architecture rewrite in flight** (legacy `packages/opencode` → V2 `packages/core`/`cli` "lildax", Effect-based).
- Embedding exists and is good (V1 `@opencode-ai/sdk` `createOpencode()` in-process; V2 `@opencode/sdk` `OpenCode.create()` in-memory host, `plugins: [...]` at startup; `@opencode/client/service` `Service.ensure()`), which is exactly why it stayed a finalist. Rejected on weight/churn/dev-centricity (D3).
- Its provider system (75+ providers via Vercel AI SDK + models.dev; custom OpenAI-compatible providers = one config block; platform-provided models precedent: OpenCode Zen/Go) is the model for our M6 gateway design.
- Docs: https://opencode.ai/docs/sdk/, https://opencode.ai/v2/docs/build/sdk, https://opencode.ai/docs/providers/

### Others screened & rejected
- **Claude Agent SDK**: embeds Claude Code runtime; Anthropic-API-shaped; multi-provider via OpenRouter is an env-var hack (`ANTHROPIC_BASE_URL`), unofficial. https://openrouter.ai/docs/guides/community/anthropic-agent-sdk
- **Dyad** (`dyad-sh/dyad`): Apache-2.0 outside `src/pro` (FSL 1.1 inside — must be dropped in any fork). "Lovable as desktop app" — excellent UX reference; engine writes local Next.js files (wrong model for us: sites are hosted on PageWeave). Simple loop (`<dyad-*>` tags).
- **Open WebUI + "Computer"**: branding-clause license — rebranding forbidden >50 users without enterprise license. Not white-labelable.
- **Chatbox** (GPLv3 — copyleft blocks closed white-label), **Jan** (Apache-2.0 but a BYOK chat terminal, no product UI), **Msty** (proprietary), **Onlook** (Apache-2.0, dev/designer tool).
- **CopilotKit** (MIT, 37k★) & **assistant-ui** (MIT) — React chat UI component libraries; candidates for M4 chat components if we don't hand-roll.

## 2. Fork-vs-embed literature (why D1)

- Eclipse Foundation: "Why Cursor, Windsurf and co fork VS Code, but shouldn't" (2025-12): forks bring ongoing rebasing, ecosystem/marketplace loss, competitor-controlled governance.
- EclipseSource: "Is forking VS Code a good idea?" — "starts smoothly, becomes a nightmare later"; hidden maintenance costs hit at unannounced times.
- Cursor: fork decision sustained by ~100 engineers; every upstream release = integration work (theaiengineer.substack.com, 2026-02).
- Augment Code: "To fork or not to fork" — plugin path chosen for long-term customer interests.
- Practical fork mitigation pattern if ever needed: shadow-branch CI auto-merge PRs per upstream tag; quarantine branding patches as build-time overlay.

## 3. Electron vs Tauri (why D4)

- 2026 comparisons converge on decision trees; the decisive branch for us: "large existing Node backend inside the app → Electron" (arvucore.com guide; forasoft.com guide: "if you have a web app and need 3 OSes, Electron is the default").
- Tauri sidecar reality (dev.to practitioner reports 2026): `bun build --compile` sidecar ~80MB, target-triple file naming, orphaned-process guards (stdin-EOF liveness), health-poll backoff, macOS sidecar codesigning, custom binary self-update (checksum + atomic swap). CI needs per-OS runners; Tauri can't cross-compile between OSes.
- Electron costs: installers 130–250MB, idle RAM hundreds of MB, **major release every ~8 weeks, only latest 3 supported** → recommended cadence: every second major, ~3/yr, 2–4 engineer-days each (forasoft.com).
- Security: Electron hardening is config (contextIsolation/sandbox/CSP/preload discipline); Tauri defaults stricter. Our posture in ARCHITECTURE.md compensates.
- Precedents: OpenCode's own desktop = Electron 42.x + electron-vite + electron-builder; Dyad = Electron.

## 4. Naming (context for D8)

- Meta relaunched "Creator Studio" as standalone AI app (June–Aug 2026; The Verge, TechCrunch) → "Creator" collides + creator-economy connotation.
- 2026 naming consensus (inkbotdesign.com, saasdash.ai, nymly.app): descriptive suffixes weakest trademark/brand pattern; monolithic single-brand is default for single-product SaaS; strong pattern = short evocative single names (Cursor/Lovable/v0).
- User weighed clarity-for-non-technical-users higher → "PageWeave Builder".

## 5. PageWeave platform facts used in this plan

From the platform repo's agent docs (verify against current Rails app when implementing):
- MCP server: served by the Rails app on pageweave.dev; bearer-token auth (OAuth); tools derive read/write scope from annotations; destructive tools require user confirmation via workflow URLs (6h expiry).
- Environments: every site has a default env (live, on the subdomain) and a dev env at `https://<subdomain>.env.pageweave.site/` (noindex, live_reload on, drafts visible) — the preview target.
- OAuth: existing stack (Doorkeeper-derived, custom controllers, coarse `read`/`write` scopes, canonical names in token responses).
- Skills/agent knowledge sources to bundle: https://pageweave.dev/docs.md, /docs/design.md, /docs/liquid.md, /docs/i18n.md, /docs/privacy.md.
