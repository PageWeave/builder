import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PersistedAuth } from './protocol'

/**
 * Encryption boundary for persisted auth material. The Electron adapter
 * (safeStorage) lives in controller.ts; tests inject a fake. Implementations
 * must refuse to operate when secure storage is unavailable — never fall back
 * to plaintext (see electron-security skill).
 */
export interface AuthEncryptor {
  isAvailable(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(ciphertext: Buffer): string
}

export const EMPTY_AUTH: PersistedAuth = { registration: null, tokens: null }

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/**
 * Encrypted-at-rest persistence for registration + tokens, written atomically
 * (tmp + rename, mode 0600) into userData. Unreadable/corrupt files are
 * treated as signed-out and removed — never crash the app over stale state.
 */
export class AuthStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: AuthEncryptor,
  ) {}

  async load(): Promise<PersistedAuth> {
    let raw: Buffer
    try {
      raw = await readFile(this.filePath)
    } catch (err) {
      if (isNotFound(err)) return EMPTY_AUTH
      throw err
    }
    if (!this.encryptor.isAvailable()) return EMPTY_AUTH
    let state: PersistedAuth
    try {
      const parsed: unknown = JSON.parse(this.encryptor.decrypt(raw))
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
      state = parsed as PersistedAuth
    } catch {
      await this.clear()
      return EMPTY_AUTH
    }
    return state
  }

  async save(state: PersistedAuth): Promise<void> {
    if (!this.encryptor.isAvailable()) {
      throw new Error(
        'Secure storage is unavailable on this system — cannot persist sign-in. (Linux: install a keyring service such as gnome-keyring.)',
      )
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    try {
      await writeFile(tmp, this.encryptor.encrypt(JSON.stringify(state)), { mode: 0o600 })
      await rename(tmp, this.filePath)
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true })
  }
}
