import { safeStorage, shell } from 'electron'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  dynamicClientRegistration,
  randomPKCECodeVerifier,
  randomState,
  refreshTokenGrant,
  tokenRevocation,
  type Configuration,
} from 'openid-client'
import type { AuthState } from '../../shared/ipc'
import {
  CALLBACK_PATH,
  CALLBACK_REGISTRATION_URI,
  ISSUER_URL,
  REGISTRATION_RETRY_MS,
  SCOPE,
  authErrorMessage,
  clientAuthFor,
  isExpired,
  registrationMetadata,
  tokenRecordFromResponse,
  type RegistrationRecord,
  type TokenRecord,
} from './protocol'
import { LoopbackServer } from './loopback'
import { AuthStore, type AuthEncryptor } from './store'

/** Electron safeStorage adapter. Refuses to persist when unavailable. */
export const safeStorageEncryptor: AuthEncryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
}

/** Refresh proactively this long before access-token expiry. */
const REFRESH_MARGIN_MS = 5 * 60_000
const MIN_REFRESH_DELAY_MS = 30_000

export interface AuthControllerOptions {
  /** Absolute path of the encrypted auth file inside userData. */
  storePath: string
  /** Injectable for tests; defaults to shell.openExternal. */
  openExternal?: (url: string) => Promise<void>
}

/**
 * Owns the entire OAuth lifecycle in the main process: dynamic client
 * registration (once per install), the RFC 8252 system-browser flow, refresh
 * (single-flight, proactive + on-demand), revocation, and encrypted
 * persistence. Tokens never leave this module — the renderer sees AuthState
 * only, and M3's engine receives the access token via main.
 */
export class AuthController {
  private readonly store: AuthStore
  private readonly openExternal: (url: string) => Promise<void>
  private config: Configuration | null = null
  private registration: RegistrationRecord | null = null
  private tokens: TokenRecord | null = null
  private state: AuthState = { status: 'signed-out' }
  private refreshTimer: NodeJS.Timeout | null = null
  private signInPromise: Promise<AuthState> | null = null
  private refreshPromise: Promise<void> | null = null
  private lastRegistrationAt = 0
  private readonly listeners = new Set<(state: AuthState) => void>()

  constructor(options: AuthControllerOptions) {
    this.store = new AuthStore(options.storePath, safeStorageEncryptor)
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url))
  }

  /** Subscribes to state changes; returns an unsubscribe function. */
  onState(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState(): AuthState {
    return this.state
  }

  /**
   * Boot: restore persisted state. Valid tokens → signed-in; expired tokens
   * with a refresh token → silent refresh; anything else → signed-out.
   */
  async init(): Promise<void> {
    const persisted = await this.store.load()
    this.registration = persisted.registration
    this.tokens = persisted.tokens
    if (this.tokens && !isExpired(this.tokens)) {
      this.set({ status: 'signed-in' })
      this.scheduleRefresh()
      return
    }
    if (this.tokens?.refreshToken && this.registration) {
      try {
        await this.refresh()
        return
      } catch {
        // fall through to signed-out
      }
    }
    if (this.tokens) {
      this.tokens = null
      await this.store.save({ registration: this.registration, tokens: null })
    }
    this.set({ status: 'signed-out' })
  }

  /** Single sign-in at a time; concurrent callers share the in-flight flow. */
  signIn(): Promise<AuthState> {
    this.signInPromise ??= this.doSignIn().finally(() => {
      this.signInPromise = null
    })
    return this.signInPromise
  }

  /** Revoke best-effort, wipe persistence, broadcast signed-out. */
  async signOut(): Promise<AuthState> {
    this.clearRefreshTimer()
    const config = await this.existingConfig()
    const token = this.tokens?.refreshToken ?? this.tokens?.accessToken
    if (config && token) {
      try {
        await tokenRevocation(config, token, { token_type_hint: 'refresh_token' })
      } catch {
        // Best-effort: local wipe must happen even if the server is unreachable.
      }
    }
    this.tokens = null
    await this.store.save({ registration: this.registration, tokens: null })
    this.set({ status: 'signed-out' })
    return this.state
  }

  /**
   * Valid access token for authorized calls (M3 engine surface). Refreshes
   * single-flight when inside the expiry skew.
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) throw new Error('Not signed in.')
    if (isExpired(this.tokens) && this.tokens.refreshToken && this.registration) {
      await this.refresh()
    }
    if (!this.tokens || isExpired(this.tokens)) throw new Error('Session expired — please sign in again.')
    return this.tokens.accessToken
  }

  dispose(): void {
    this.clearRefreshTimer()
    this.listeners.clear()
  }

  private async doSignIn(): Promise<AuthState> {
    this.set({ status: 'signing-in' })
    try {
      const config = await this.ensureConfig()
      const loopback = new LoopbackServer()
      const port = await loopback.start()
      try {
        const verifier = randomPKCECodeVerifier()
        const challenge = await calculatePKCECodeChallenge(verifier)
        const state = randomState()
        const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`
        const authorizeUrl = buildAuthorizationUrl(config, {
          redirect_uri: redirectUri,
          scope: SCOPE,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
        })
        if (authorizeUrl.protocol !== 'https:') throw new Error('refusing to open a non-https authorization URL')
        const callback = loopback.waitCallback(state)
        await this.openExternal(authorizeUrl.href)
        const callbackUrl = await callback
        const response = await authorizationCodeGrant(config, callbackUrl, {
          pkceCodeVerifier: verifier,
          expectedState: state,
        })
        this.tokens = tokenRecordFromResponse(response)
        await this.store.save({ registration: this.registration, tokens: this.tokens })
        this.scheduleRefresh()
        this.set({ status: 'signed-in' })
      } finally {
        await loopback.close()
      }
    } catch (err) {
      this.set({ status: 'signed-out', error: authErrorMessage(err) })
    }
    return this.state
  }

  /**
   * Configuration for the current flow. Reuses the persisted registration via
   * discovery; only registers dynamically when no registration exists (the
   * platform throttles /oauth/register — never register casually).
   */
  private async ensureConfig(): Promise<Configuration> {
    if (this.config) return this.config
    const issuer = new URL(ISSUER_URL)
    if (this.registration) {
      this.config = await discovery(
        issuer,
        this.registration.clientId,
        {
          redirect_uris: [CALLBACK_REGISTRATION_URI],
          token_endpoint_auth_method: this.registration.clientSecret ? 'client_secret_post' : 'none',
        },
        clientAuthFor(this.registration),
      )
      return this.config
    }
    if (Date.now() - this.lastRegistrationAt < REGISTRATION_RETRY_MS) {
      throw new Error('Sign-in setup was just attempted — please wait a few minutes and try again.')
    }
    this.lastRegistrationAt = Date.now()
    this.config = await dynamicClientRegistration(issuer, registrationMetadata())
    const issuedSecret = this.config.clientMetadata().client_secret
    const registration: RegistrationRecord = { clientId: this.config.clientMetadata().client_id, createdAt: Date.now() }
    if (issuedSecret !== undefined) registration.clientSecret = issuedSecret
    this.registration = registration
    return this.config
  }

  /** Config for refresh/revoke — discovery only, never registers. */
  private async existingConfig(): Promise<Configuration | null> {
    if (this.config) return this.config
    if (!this.registration) return null
    try {
      return await this.ensureConfig()
    } catch {
      return null
    }
  }

  private refresh(): Promise<void> {
    this.refreshPromise ??= this.doRefresh().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async doRefresh(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken
    if (!refreshToken || !this.registration) throw new Error('no refresh token')
    const config = await this.ensureConfig()
    const response = await refreshTokenGrant(config, refreshToken)
    this.tokens = tokenRecordFromResponse(response, Date.now(), refreshToken)
    await this.store.save({ registration: this.registration, tokens: this.tokens })
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer()
    if (!this.tokens?.refreshToken) return
    const delay = Math.max(this.tokens.expiresAt - REFRESH_MARGIN_MS - Date.now(), MIN_REFRESH_DELAY_MS)
    this.refreshTimer = setTimeout(() => {
      void this.refresh().catch(() => {
        // Proactive refresh is best-effort; getAccessToken retries on demand.
      })
    }, delay)
    this.refreshTimer.unref()
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private set(state: AuthState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}
