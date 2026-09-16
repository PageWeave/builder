import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client'
import { afterAll, describe, expect, it } from 'vitest'
import { LoopbackServer } from '../src/main/auth/loopback'
import {
  CALLBACK_PATH,
  authErrorMessage,
  classifyCallback,
  escapeHtml,
  isExpired,
  registrationMetadata,
  tokenRecordFromResponse,
  type TokenRecord,
} from '../src/main/auth/protocol'
import { AuthStore, type AuthEncryptor } from '../src/main/auth/store'

const tmpDirs: string[] = []

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempStore(fake: AuthEncryptor): Promise<{ store: AuthStore; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pw-auth-'))
  tmpDirs.push(dir)
  const path = join(dir, 'auth.enc')
  return { store: new AuthStore(path, fake), path }
}

/** Deterministic reversible fake standing in for safeStorage. */
const fakeEncryptor: AuthEncryptor = {
  isAvailable: () => true,
  encrypt: (plaintext) => Buffer.from(`enc:${Buffer.from(plaintext).toString('base64')}`),
  decrypt: (ciphertext) => {
    const text = ciphertext.toString()
    if (!text.startsWith('enc:')) throw new Error('not encrypted')
    return Buffer.from(text.slice(4), 'base64').toString()
  },
}

const unavailableEncryptor: AuthEncryptor = {
  isAvailable: () => false,
  encrypt: () => {
    throw new Error('should not encrypt')
  },
  decrypt: () => {
    throw new Error('should not decrypt')
  },
}

describe('PKCE + state wiring (S256 cross-check)', () => {
  it('challenge is BASE64URL(SHA256(verifier)) — catches accidental plain method', async () => {
    const verifier = randomPKCECodeVerifier()
    const challenge = await calculatePKCECodeChallenge(verifier)
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/)
  })

  it('state is high-entropy and unique per call', () => {
    const a = randomState()
    const b = randomState()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(16)
  })
})

describe('callback classification', () => {
  const base = (qs: string): URL => new URL(`http://127.0.0.1:51004${CALLBACK_PATH}?${qs}`)

  it('accepts a matching code+state', () => {
    expect(classifyCallback(base('code=abc&state=s1'), 's1')).toEqual({ kind: 'success', code: 'abc' })
  })

  it('drops forged/stale redirects regardless of payload (state checked first)', () => {
    expect(classifyCallback(base('code=abc&state=evil'), 's1')).toEqual({ kind: 'state-mismatch' })
    expect(classifyCallback(base('error=access_denied&state=evil'), 's1')).toEqual({ kind: 'state-mismatch' })
    expect(classifyCallback(base('code=abc'), 's1')).toEqual({ kind: 'state-mismatch' })
  })

  it('surfaces error redirects with description', () => {
    expect(classifyCallback(base('error=access_denied&error_description=nope&state=s1'), 's1')).toEqual({
      kind: 'error',
      error: 'access_denied',
      description: 'nope',
    })
  })

  it('rejects wrong host, wrong path, and codeless callbacks', () => {
    expect(classifyCallback(new URL('https://evil.example/callback?code=x&state=s1'), 's1')).toEqual({
      kind: 'not-callback',
    })
    expect(classifyCallback(new URL('http://127.0.0.1:51004/other?code=x&state=s1'), 's1')).toEqual({
      kind: 'not-callback',
    })
    expect(classifyCallback(base('state=s1'), 's1')).toEqual({ kind: 'not-callback' })
  })
})

describe('token records + expiry', () => {
  const now = 1_000_000_000_000

  it('computes expiresAt from expires_in (default 1h per platform docs)', () => {
    const withTtl = tokenRecordFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 120 }, now)
    expect(withTtl.expiresAt).toBe(now + 120_000)
    const defaulted = tokenRecordFromResponse({ access_token: 'a' }, now)
    expect(defaulted.expiresAt).toBe(now + 3_600_000)
  })

  it('keeps the previous refresh token when the response omits one', () => {
    const rec = tokenRecordFromResponse({ access_token: 'a' }, now, 'old-refresh')
    expect(rec.refreshToken).toBe('old-refresh')
    const rotated = tokenRecordFromResponse({ access_token: 'a', refresh_token: 'new' }, now, 'old-refresh')
    expect(rotated.refreshToken).toBe('new')
  })

  it('isExpired applies the safety skew', () => {
    const rec: TokenRecord = { accessToken: 'a', expiresAt: now + 60_000 }
    expect(isExpired(rec, now)).toBe(false)
    expect(isExpired(rec, now + 35_000)).toBe(true)
    expect(isExpired(null, now)).toBe(true)
  })
})

describe('error message mapping (secret-free)', () => {
  it('maps oauth errors, keeps generic messages, never echoes tokens', () => {
    expect(authErrorMessage({ error: 'access_denied' })).toBe('Sign-in was cancelled in the browser.')
    expect(authErrorMessage({ error: 'invalid_grant', error_description: 'code expired' })).toBe(
      'invalid_grant: code expired',
    )
    expect(authErrorMessage(new Error('boom'))).toBe('boom')
    expect(authErrorMessage('weird')).toBe('weird')
  })
})

describe('loopback response escaping', () => {
  it('escapes untrusted text', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })
})

describe('registration metadata contract', () => {
  it('registers as a public client with the portless loopback redirect', () => {
    const meta = registrationMetadata()
    expect(meta.token_endpoint_auth_method).toBe('none')
    expect(meta.redirect_uris).toEqual(['http://127.0.0.1/callback'])
    expect(meta.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(meta.response_types).toEqual(['code'])
  })
})

describe('AuthStore (encrypted persistence)', () => {
  const state = {
    registration: { clientId: 'cid', createdAt: 1 },
    tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: 5 },
  }

  it('round-trips through the encryptor', async () => {
    const { store } = await tempStore(fakeEncryptor)
    await store.save(state)
    expect(await store.load()).toEqual(state)
  })

  it('missing file → empty state', async () => {
    const { store } = await tempStore(fakeEncryptor)
    expect(await store.load()).toEqual({ registration: null, tokens: null })
  })

  it('corrupt file → empty state and file removed', async () => {
    const { store, path } = await tempStore(fakeEncryptor)
    await writeFile(path, 'garbage')
    expect(await store.load()).toEqual({ registration: null, tokens: null })
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('unavailable secure storage: load → empty, save → refuses (never plaintext)', async () => {
    const { store, path } = await tempStore(unavailableEncryptor)
    await writeFile(path, fakeEncryptor.encrypt(JSON.stringify(state)))
    expect(await store.load()).toEqual({ registration: null, tokens: null })
    await expect(store.save(state)).rejects.toThrow(/Secure storage is unavailable/)
    await expect(readFile(path)).resolves.toBeTruthy()
  })

  it('clear removes the file; save leaves no temp file behind', async () => {
    const { store, path } = await tempStore(fakeEncryptor)
    await store.save(state)
    expect(await store.load()).toEqual(state)
    expect(await readFile(`${path}.tmp`).then(() => true, () => false)).toBe(false)
    await store.clear()
    expect(await store.load()).toEqual({ registration: null, tokens: null })
  })
})

describe('LoopbackServer', () => {
  async function get(url: string): Promise<{ status: number; body: string }> {
    const res = await fetch(url)
    return { status: res.status, body: await res.text() }
  }

  it('binds an ephemeral port on 127.0.0.1 only, serves the success page, and settles once', async () => {
    const server = new LoopbackServer()
    const port = await server.start()
    expect(port).toBeGreaterThan(0)
    const waiting = server.waitCallback('st8', 5000)

    const wrong = await get(`http://127.0.0.1:${port}/nope?code=x&state=st8`)
    expect(wrong.status).toBe(404)

    const forged = await get(`http://127.0.0.1:${port}${CALLBACK_PATH}?code=x&state=evil`)
    expect(forged.status).toBe(400)
    await new Promise((r) => setTimeout(r, 50))
    let settledEarly = false
    void waiting.then(
      () => {
        settledEarly = true
      },
      () => {
        settledEarly = true
      },
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(settledEarly).toBe(false)

    const ok = await get(`http://127.0.0.1:${port}${CALLBACK_PATH}?code=abc&state=st8`)
    expect(ok.status).toBe(200)
    expect(ok.body).toContain('Signed in')
    expect(await waiting).toEqual(new URL(`http://127.0.0.1:${port}${CALLBACK_PATH}?code=abc&state=st8`))

    const late = await get(`http://127.0.0.1:${port}${CALLBACK_PATH}?code=abc&state=st8`)
    expect(late.status).toBe(503)
    await server.close()
  })

  it('rejects with the oauth error and shows an escaped error page', async () => {
    const server = new LoopbackServer()
    const port = await server.start()
    const waiting = server.waitCallback('st8', 5000)
    const assertion = expect(waiting).rejects.toThrow('access_denied')
    const res = await get(
      `http://127.0.0.1:${port}${CALLBACK_PATH}?error=access_denied&error_description=%3Cb%3Eno%3C/b%3E&state=st8`,
    )
    expect(res.status).toBe(200)
    expect(res.body).not.toContain('<b>')
    await assertion
    await server.close()
  })

  it('times out when no callback arrives', async () => {
    const server = new LoopbackServer()
    await server.start()
    const waiting = server.waitCallback('st8', 50)
    await expect(waiting).rejects.toThrow(/timed out/)
    await server.close()
  })
})
