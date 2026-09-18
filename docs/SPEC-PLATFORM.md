# SPEC-PLATFORM.md — PageWeave platform integration

Everything this app needs from the PageWeave Rails platform (`~/dev/pageweave`, production: pageweave.dev). **Items marked CONFIRM must be verified against the current Rails app before the depending milestone starts** — resolve by reading the platform repo / asking the user; then update this file and delete the CONFIRM flag.

## MCP server

| Item | Value |
|---|---|
| Base URL | `https://pageweave.dev/mcp` — **verified 2026-09-17** (advertised as `resource` in the RFC 9728 protected-resource metadata; platform docs: `POST /mcp`, Streamable HTTP) |
| Transport | Streamable HTTP (HTTP+SSE). Platform docs configure clients with `type: http`/`streamable-http`; if legacy-SSE-only were true, `pi-mcp-adapter` supports `sse` too (re-verify hands-on when M3 wires the adapter) |
| Auth | `Authorization: Bearer <oauth access token>` |
| Scopes | Coarse `read` + `write` (platform's bearer model; MCP tools derive per-tool checks from annotations) |
| Tool surface | ~45 tools (`list_websites`, `get_website`, `create_website`, `get_page`/`list_pages`/`update_page`/`create_page`, snippets, components, assets, theme, forms, tables, environments, releases, feedback, …). Full list: the MCP server's tools/list, or `app/mcp_server/mcp/tools/*.rb` in the platform repo |
| Confirmations | Destructive tools return workflow URLs requiring user approval (browser, 6h expiry) → render as cards (D10) |
| MCP server version note | Platform bumps `Mcp::ServerFactory::SERVER_VERSION` per SemVer — tool list/behavior may evolve; app must tolerate unknown tools (agent sees them via tools/list at runtime, nothing hardcoded) |

## OAuth

Verified against the live discovery endpoints + https://pageweave.dev/docs/oauth.md on 2026-09-17. Implemented per DECISIONS D13 (`openid-client@6.8.8`, `src/main/auth/`). No CONFIRM items remain.

| Item | Value |
|---|---|
| Provider | PageWeave's OAuth 2.1 authorization server (Doorkeeper-derived) |
| Issuer | `https://pageweave.dev` — RFC 8414 metadata at `/.well-known/oauth-authorization-server`; RFC 9728 protected-resource metadata (`/.well-known/oauth-protected-resource`) advertises it as the AS for `https://pageweave.dev/mcp` |
| Client registration | **RFC 7591 dynamic** — `POST https://pageweave.dev/oauth/register`, open (no initial access token), **throttled 5/h/IP** (platform Rack::Attack). Registration is once per install, persisted (encrypted) in safeStorage |
| Client type | Public — `token_endpoint_auth_method: "none"`, PKCE S256 only (`code_challenge_methods_supported: ["S256"]`) |
| Redirect URI | Registered portless `http://127.0.0.1/callback`; request-time port is ephemeral. Platform's Doorkeeper ignores loopback ports per RFC 8252 §7.3 (path compared exactly) |
| Grant types | `authorization_code` + `refresh_token` (both advertised) |
| Scopes | `read write` — always both, canonical names in token responses, `invalid_scope` on unknown |
| Token lifetime | Access tokens expire after 1h; refresh proactively (~5 min margin), single-flight, + on-demand (`getAccessToken`) |
| Revocation | `revocation_endpoint: https://pageweave.dev/oauth/revoke` (RFC 7009) — best-effort on sign-out, local wipe always happens |
| Storage | Electron `safeStorage` via `AuthStore` (atomic 0600 writes, userData); no plaintext fallback — persist refuses when the OS keyring is unavailable |
| MCP authorization | `Authorization: Bearer <access token>` on `https://pageweave.dev/mcp` |
| API-key fallback | `pagew_...` keys exist for CI/server use — not used by the app |

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
| App id | `dev.pageweave.builder` — reverse-DNS scheme adopted (D17, 2026-09-18); Windows GUID derives from it at build time |
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

1. Optional: product-identification header for MCP requests (M3+, nice-to-have)
2. ~~M5: decide auto-update feed host~~ — RESOLVED 2026-09-18 (D17): GitHub Releases drafts via electron-updater; revisit only if branded download URLs become a requirement

(The former "register desktop OAuth client" task was removed 2026-09-17: the platform's RFC 7591 dynamic registration makes it unnecessary — see DECISIONS D13. The former "confirm MCP endpoint/transports" task was resolved by the RFC 9728 metadata + client config docs.)
