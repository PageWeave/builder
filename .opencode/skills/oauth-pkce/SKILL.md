---
name: oauth-pkce
description: PageWeave OAuth sign-in for this app — RFC 8252 loopback flow in a public client with PKCE, system browser via shell.openExternal, short-lived local HTTP callback server, safeStorage token persistence, refresh in main, secrets never in renderer. Use when working on sign-in/sign-out (M2), token storage/refresh, the loopback callback server, or anything touching OAuth tokens or client registration.
---

# OAuth (PageWeave, public client + PKCE) — M2

Read first: `docs/SPEC-PLATFORM.md` § OAuth (CONFIRM items + platform-side task), `docs/DECISIONS.md` D7, `docs/ARCHITECTURE.md` § Main process.

## Flow (all privileged parts in main)

1. Renderer invokes sign-in over `window.pw` → main generates `code_verifier` + S256 `code_challenge` + `state`.
2. Main starts a **short-lived HTTP server on `http://127.0.0.1:<random-port>/callback`** (plain Node `http` module in main; bind 127.0.0.1 only; close immediately after the code arrives).
3. Main opens the system browser: `shell.openExternal(authorizeUrl)` with `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope=read write`, `redirect_uri`. Never an in-app window for the IdP.
4. Callback handler validates `state`, extracts `code`, exchanges it token-endpoint (code + verifier). Refresh token if issued → all into **`safeStorage`** (OS keychain), main process only.
5. Renderer learns "signed in" via typed IPC state push — it never sees the token.

## Hard rules

- **Tokens (access + refresh) and all provider keys live in main + safeStorage. Never in the renderer, never in logs, never in error objects sent to the renderer.** Anything returning auth state to the renderer returns booleans/expiry at most.
- `state` must be validated on callback; ignore requests that don't match (log-and-drop, no user-facing error leak).
- Refresh happens in main, transparently: on 401 from an MCP call or proactively near expiry. Sign-out = revoke if the platform supports it + wipe safeStorage entries + clear any cached state.
- Loopback redirect with arbitrary port must be registered as `http://127.0.0.1/callback` per RFC 8252 §7.3 **if the platform accepts it — CONFIRM item**. Also CONFIRM: refresh-token issuance for public clients. **The desktop client registration itself (client_id) is a platform-side task that BLOCKS M2** — surface it early, do not silently stub (SPEC-PLATFORM § Platform-side tasks).
- Scopes: coarse `read write`; no incremental-scope flows in v1.

## Testing

- Pure-function unit tests: PKCE pair generation shape, state comparison, callback URL parsing (valid code, mismatched state, missing code, wrong port).
- Token persistence mocked at the safeStorage boundary — no real keychain in tests.
- M2 acceptance is the real loop: fresh install → sign in → browser → signed in; token survives restart; sign-out clears everything (Playwright E2E formalizes this at M4).

## Red flags

- Any OAuth step in the renderer or preload (fetching the token, holding it, refreshing).
- `http://localhost:` instead of `127.0.0.1` (RFC 8252 requires literal IP for loopback).
- Leaving the callback server running after sign-in completes.
- Token in a query string of any internal navigation, or in `console.log` "for debugging".
- Hardcoding a client_id from another app — the registered client is PageWeave Builder's own.

## Sources

- RFC 8252 (OAuth for Native Apps): https://datatracker.ietf.org/doc/html/rfc8252
- docs/SPEC-PLATFORM.md § OAuth (platform's Doorkeeper-derived stack, canonical scope names)
- Electron safeStorage: https://electronjs.org/docs/latest/api/safe-storage
