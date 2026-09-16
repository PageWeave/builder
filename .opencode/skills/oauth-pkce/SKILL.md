---
name: oauth-pkce
description: PageWeave OAuth sign-in for this app (M2, implemented) — openid-client 6.8.8 in main, RFC 7591 dynamic client registration once per install, RFC 8252 loopback flow with ephemeral port, PKCE S256, safeStorage-only persistence, single-flight refresh, RFC 7009 revocation. Use when working on sign-in/sign-out, token storage/refresh, the loopback callback server, getAccessToken (M3 engine surface), or anything touching OAuth tokens or client registration.
---

# OAuth (PageWeave, public client + PKCE) — implemented in M2

Read first: `docs/SPEC-PLATFORM.md` § OAuth (all facts verified against live metadata 2026-09-17), `docs/DECISIONS.md` D13, `src/main/auth/` (the implementation).

## Layout (main process only)

- `protocol.ts` — pure logic + constants: issuer `https://pageweave.dev`, `CALLBACK_PATH`/`CALLBACK_REGISTRATION_URI` (`http://127.0.0.1/callback`, portless — the platform's Doorkeeper ignores loopback ports per RFC 8252 §7.3), registration metadata, `classifyCallback` (state checked FIRST — forged redirects never reach the flow), token/expiry math, `authErrorMessage` (secret-free).
- `store.ts` — `AuthStore`: encrypted-at-rest JSON (registration + tokens) via injectable `AuthEncryptor`; atomic 0600 writes; corrupt file → empty state, never a crash; unavailable keyring → save REFUSES (no plaintext fallback ever).
- `loopback.ts` — `LoopbackServer`: one-shot `node:http` on `127.0.0.1:0`; GET-only; 404 non-callback, 400 + keep-waiting on state mismatch, 200 error page + reject on AS error redirect, 200 success page + resolve with callback URL; 5-min timeout; caller closes in `finally` (RFC 8252 §8.3).
- `controller.ts` — `AuthController`: the only electron+openid-client consumer. `init()` (boot restore → silent refresh), `signIn()` (single-flight), `signOut()` (best-effort revoke, always wipe), `getAccessToken()` (M3 engine surface, refreshes on demand), `onState()` push with unsubscribe, `dispose()`.

## Flow

1. First sign-in: `dynamicClientRegistration(issuer, registrationMetadata())` — public client, `token_endpoint_auth_method: 'none'`, redirect_uris `[http://127.0.0.1/callback]`, grants `authorization_code`+`refresh_token`. **Once per install** — the platform throttles `/oauth/register` 5/h/IP; a 10-min retry guard backs this. Persist client_id (+ secret only if the AS issues one despite `none`; then `ClientSecretPost` — the per-install secret is legit confidential material, RFC 7591 §A.4.1).
2. Later flows/boots: `discovery(issuer, clientId, metadata, clientAuthFor(reg))` — never re-register.
3. Sign-in: ephemeral loopback port → `randomPKCECodeVerifier` + `calculatePKCECodeChallenge` (S256) + `randomState` → `buildAuthorizationUrl` (`scope: 'read write'`) → assert https → `shell.openExternal` → `authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier, expectedState })` → tokens to store.
4. Refresh: `refreshTokenGrant` — scheduled at expiry−5 min (min 30 s) and on demand in `getAccessToken`; single-flight; keep old refresh token when the response omits one.
5. Sign-out: `tokenRevocation(config, refreshToken ?? accessToken)` best-effort (offline-safe), then wipe store + memory, broadcast signed-out.

## Hard rules (unchanged from M0, now enforced in code)

- Tokens live ONLY in `AuthController`/`AuthStore` (main + safeStorage). Renderer gets `AuthState` = `{ status, error? }` — secret-free strings only. Engine gets the access token via main (M3).
- Never embed a client secret in the binary; never log tokens; never put tokens in error objects.
- System browser only — no BrowserWindow for the IdP (RFC 8252 §8.12). `127.0.0.1` literal, never `localhost` (§8.3).
- `state` validated before anything else in a callback is accepted; mismatches get 400 and the flow keeps waiting.

## Testing (tests/auth.test.ts)

- PKCE cross-check: challenge === BASE64URL(SHA256(verifier)) — catches accidental `plain`.
- `classifyCallback`: success / forged-state drop (before error handling) / AS error passthrough / wrong host+path.
- `LoopbackServer` over real loopback HTTP: one-shot settle, 404/400/503 paths, escaped error pages, timeout, port freed on close.
- `AuthStore` with fake encryptor + temp dir: round-trip, corrupt → empty + removed, unavailable-keyring refusal, no temp-file leftovers.
- `registrationMetadata()` contract guard (public client, portless loopback URI).

## Red flags

- Any OAuth step in renderer/preload; tokens in `AuthState`; raw `ipcRenderer` in renderer.
- Re-registering clients on boot or retry loops without the guard (throttle!).
- Plaintext or unencrypted-at-rest persistence; `safeStorage` fallback to base64 "just for dev".
- `localhost:` redirect URIs; loopback server left listening after the flow.
- Importing `openid-client` outside `src/main/auth/` (isolation like the engine's `@earendil-works/*` rule).

## Sources

- RFC 8252 (OAuth for Native Apps) §7.3 loopback ports, §8.3 hygiene, §8.12 no embedded UA: https://datatracker.ietf.org/doc/html/rfc8252
- RFC 7591 (DCR) + §A.4.1 per-install credentials: https://datatracker.ietf.org/doc/html/rfc7591
- Doorkeeper URIChecker (platform stack): port-agnostic loopback matching https://github.com/doorkeeper-gem/doorkeeper/blob/main/lib/doorkeeper/oauth/helpers/uri_checker.rb
- openid-client v6 docs: https://github.com/panva/openid-client
- PageWeave OAuth docs: https://pageweave.dev/docs/oauth.md
- Electron safeStorage: https://electronjs.org/docs/latest/api/safe-storage
