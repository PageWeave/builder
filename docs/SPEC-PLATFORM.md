# SPEC-PLATFORM.md — PageWeave platform integration

Everything this app needs from the PageWeave Rails platform (`~/dev/pageweave`, production: pageweave.dev). **Items marked CONFIRM must be verified against the current Rails app before the depending milestone starts** — resolve by reading the platform repo / asking the user; then update this file and delete the CONFIRM flag.

## MCP server

| Item | Value |
|---|---|
| Base URL | `https://pageweave.dev/mcp` — **CONFIRM exact path** (grep the Rails routes for the MCP controller; the MCP server is served by the Rails app per platform AGENTS.md) |
| Transport | Streamable HTTP (HTTP+SSE). **CONFIRM** the server's supported transports; if legacy-SSE-only, `pi-mcp-adapter` supports `sse` too |
| Auth | `Authorization: Bearer <oauth access token>` |
| Scopes | Coarse `read` + `write` (platform's bearer model; MCP tools derive per-tool checks from annotations) |
| Tool surface | ~45 tools (`list_websites`, `get_website`, `create_website`, `get_page`/`list_pages`/`update_page`/`create_page`, snippets, components, assets, theme, forms, tables, environments, releases, feedback, …). Full list: the MCP server's tools/list, or `app/mcp_server/mcp/tools/*.rb` in the platform repo |
| Confirmations | Destructive tools return workflow URLs requiring user approval (browser, 6h expiry) → render as cards (D10) |
| MCP server version note | Platform bumps `Mcp::ServerFactory::SERVER_VERSION` per SemVer — tool list/behavior may evolve; app must tolerate unknown tools (agent sees them via tools/list at runtime, nothing hardcoded) |

## OAuth

| Item | Value |
|---|---|
| Provider | PageWeave's existing OAuth stack (Doorkeeper-derived, custom `Oauth::AuthorizationsController`/`TokensController`) |
| Client type | **Public client, PKCE** — needs registration |
| Redirect URI | `http://127.0.0.1:<random-port>/callback` (loopback; random port registered as `http://127.0.0.1/callback` per RFC 8252 if supported — **CONFIRM** the platform accepts loopback redirect URIs with any port) |
| Scopes | `read write` (canonical names; platform unions/normalizes legacy aliases server-side) |
| Token storage | Electron `safeStorage` (OS keychain); refresh via platform's refresh-token flow (**CONFIRM** refresh-token issuance for public clients) |
| **Platform-side task** | Register the desktop OAuth client (client_id, name "PageWeave Builder", public/PKCE, redirect URI, scopes). Owner: platform repo. Blocks M2 |

## Websites data plane

No separate REST API in v1. Website list/details/site switching all flow through the MCP tools above (`list_websites`, `get_website`, `create_website`). Do not build a parallel client.

## Preview targets

| Environment | URL | Use |
|---|---|---|
| Dev env (preview default) | `https://<subdomain>.env.pageweave.site/` | noindex, live_reload on, drafts visible — what the builder previews while editing |
| Live | `https://<subdomain>.pageweave.site/` | "view live" link |

**CONFIRM** password-protected dev envs handling for preview (RISKS R6 spike, M4).

## App identity

| Item | Value |
|---|---|
| Product name | PageWeave Builder |
| App id | `dev.pageweave.builder` — **CONFIRM** reverse-DNS scheme preference (pageweave.dev → maybe `dev.pageweave.builder` is fine) |
| Bundle ids (M5) | macOS `dev.pageweave.builder`, Windows GUID at build time |
| User agent / API identification | Identify MCP requests with a product header if the platform supports one — **CONFIRM** (nice-to-have for telemetry/debugging server-side; platform analytics are server-side only) |

## Agent knowledge sources (bundled skills/prompt material)

Curate from the platform's public docs (refresh when the platform docs change):

- https://pageweave.dev/docs.md — full platform docs (markdown)
- https://pageweave.dev/docs/design.md — design system guidance
- https://pageweave.dev/docs/liquid.md — Liquid support
- https://pageweave.dev/docs/i18n.md — multilingual sites
- https://pageweave.dev/docs/privacy.md — privacy positioning (EU, no trackers)

Skill set to ship in-app (SKILL.md files under engine resources): site-building workflow, Liquid reference, design guidance, asset/preview conventions. Version them in this repo; agent loads via pi resource loader.

## Platform-side tasks (tracked here; executed in the Rails repo with user approval)

1. **Register desktop OAuth public client** (blocks M2) — client_id to be recorded here after registration
2. Confirm/expose MCP endpoint path + transports (blocks M3 config)
3. Optional: product-identification header for MCP requests (M3+, nice-to-have)
4. M5: decide auto-update feed host (pageweave.dev static route vs GitHub releases)
