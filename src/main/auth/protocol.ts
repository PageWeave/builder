import { ClientSecretPost, None, type ClientAuth } from 'openid-client'

/**
 * PageWeave OAuth integration facts (verified against the live discovery
 * endpoints 2026-09-17, see docs/SPEC-PLATFORM.md § OAuth):
 * - RFC 8414 metadata at /.well-known/oauth-authorization-server
 * - RFC 7591 dynamic client registration at /oauth/register (open, throttled)
 * - token_endpoint_auth_methods_supported includes "none" (public client)
 * - PKCE S256 only; grants: authorization_code + refresh_token
 * - revocation_endpoint present (RFC 7009)
 */
export const ISSUER_URL = 'https://pageweave.dev'

/** RFC 8252 §7.3 loopback callback path. The port varies per sign-in flow. */
export const CALLBACK_PATH = '/callback'
/**
 * Registered redirect URI (portless). Doorkeeper (the platform's OAuth stack)
 * implements RFC 8252 §7.3: the port of loopback IP redirect URIs is ignored
 * at authorization time, so one registration serves every ephemeral port.
 * Path is compared exactly — do not vary it.
 */
export const CALLBACK_REGISTRATION_URI = `http://127.0.0.1${CALLBACK_PATH}`

/** Coarse platform scopes; authorization always grants the full set. */
export const SCOPE = 'read write'

/** Registration is once per install — the platform throttles /oauth/register. */
export const REGISTRATION_RETRY_MS = 10 * 60_000

/** Default platform access-token TTL (documented: 1 hour). */
export const DEFAULT_TOKEN_TTL_MS = 60 * 60_000

/** Client registration persisted per install, encrypted at rest (safeStorage). */
export interface RegistrationRecord {
  clientId: string
  /** Only set if the AS issued a secret despite the public-client request. */
  clientSecret?: string
  createdAt: number
}

/** OAuth tokens persisted encrypted at rest (safeStorage), main process only. */
export interface TokenRecord {
  accessToken: string
  refreshToken?: string
  /** Epoch ms at which the access token expires. */
  expiresAt: number
  scope?: string
}

export interface PersistedAuth {
  registration: RegistrationRecord | null
  tokens: TokenRecord | null
}

/** RFC 7591 client metadata for our once-per-install dynamic registration. */
export function registrationMetadata(): {
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'none'
  grant_types: string[]
  response_types: string[]
} {
  return {
    client_name: 'PageWeave Builder',
    redirect_uris: [CALLBACK_REGISTRATION_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }
}

/** Client auth matching the registration the AS actually issued. */
export function clientAuthFor(registration: RegistrationRecord | null): ClientAuth {
  return registration?.clientSecret ? ClientSecretPost(registration.clientSecret) : None()
}

export type CallbackClassification =
  | { kind: 'not-callback' }
  | { kind: 'success'; code: string }
  | { kind: 'error'; error: string; description?: string }
  | { kind: 'state-mismatch' }

/**
 * Classifies a loopback request URL against the pending flow's state.
 * State is verified BEFORE anything else is accepted — a forged redirect
 * (with or without an error/code) never reaches the flow (log-drop: 400,
 * keep waiting for the real callback).
 */
export function classifyCallback(url: URL, expectedState: string): CallbackClassification {
  if (url.hostname !== '127.0.0.1' || url.pathname !== CALLBACK_PATH) return { kind: 'not-callback' }
  const state = url.searchParams.get('state')
  if (!state || state !== expectedState) return { kind: 'state-mismatch' }
  const error = url.searchParams.get('error')
  if (error) {
    const description = url.searchParams.get('error_description') ?? undefined
    return description === undefined
      ? { kind: 'error', error }
      : { kind: 'error', error, description }
  }
  const code = url.searchParams.get('code')
  if (!code) return { kind: 'not-callback' }
  return { kind: 'success', code }
}

/** True when the record is missing or within `skewMs` of expiry (or past). */
export function isExpired(tokens: TokenRecord | null, now = Date.now(), skewMs = 30_000): boolean {
  if (!tokens) return true
  return tokens.expiresAt - skewMs <= now
}

/** Minimal structural type for openid-client token endpoint responses. */
export interface TokenEndpointResponseLike {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

export function tokenRecordFromResponse(
  res: TokenEndpointResponseLike,
  refreshedAt = Date.now(),
  fallbackRefreshToken?: string,
): TokenRecord {
  const ttlMs = (res.expires_in && res.expires_in > 0 ? res.expires_in : DEFAULT_TOKEN_TTL_MS / 1000) * 1000
  const refreshToken = res.refresh_token ?? fallbackRefreshToken
  const record: TokenRecord = {
    accessToken: res.access_token,
    // Some ASes rotate the refresh token, some return none — keep the old one
    // as fallback (Doorkeeper permits reuse).
    expiresAt: refreshedAt + ttlMs,
  }
  if (refreshToken !== undefined) record.refreshToken = refreshToken
  if (res.scope !== undefined) record.scope = res.scope
  return record
}

/** HTML-escapes untrusted text for the loopback response pages. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Extracts a human-readable, secret-free message from any auth failure. */
export function authErrorMessage(err: unknown): string {
  const oauthError = (err as { error?: unknown; error_description?: unknown } | null)?.error
  if (typeof oauthError === 'string') {
    if (oauthError === 'access_denied') return 'Sign-in was cancelled in the browser.'
    const description = (err as { error_description?: unknown }).error_description
    return typeof description === 'string' ? `${oauthError}: ${description}` : `Sign-in failed: ${oauthError}`
  }
  return err instanceof Error ? err.message : String(err)
}
