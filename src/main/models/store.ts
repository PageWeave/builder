import { safeStorage } from 'electron'
import type { ModelConfig, ModelConfigView } from '../../shared/ipc'

/**
 * BYOK model configuration persistence. The whole record (including the API
 * key) is encrypted via safeStorage — same posture as the auth store: no
 * plaintext fallback, atomic 0600 writes, corrupt file → empty state.
 */

export interface ModelEncryptor {
  isAvailable(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(ciphertext: Buffer): string
}

export const safeStorageModelEncryptor: ModelEncryptor = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
}

export class ModelStore {
  private config: ModelConfig | null = null

  constructor(
    private readonly path: string,
    private readonly encryptor: ModelEncryptor,
  ) {}

  /** Boot restore. Missing file → null; corrupt file → removed, null. */
  async load(): Promise<ModelConfig | null> {
    let raw: Buffer | null = null
    try {
      const { readFile, rm } = await import('node:fs/promises')
      raw = await readFile(this.path)
      if (!this.encryptor.isAvailable()) {
        // Encrypted file exists but cannot be decrypted on this machine.
        await rm(this.path, { force: true })
        this.config = null
        return null
      }
      this.config = JSON.parse(this.encryptor.decrypt(raw)) as ModelConfig
      return this.config
    } catch {
      if (raw !== null) {
        const { rm } = await import('node:fs/promises')
        await rm(this.path, { force: true }).catch(() => {})
      }
      this.config = null
      return null
    }
  }

  get(): ModelConfig | null {
    return this.config
  }

  view(): ModelConfigView {
    if (!this.config) return null
    const copy = { ...this.config }
    delete copy.apiKey
    return copy
  }

  /** Partial update over the current record. */
  async update(patch: Partial<ModelConfig>): Promise<ModelConfigView> {
    const next: ModelConfig = { ...(this.config ?? {}), ...stripUndefined(patch), provider: patch.provider ?? this.config?.provider ?? 'openrouter' }
    if (next.apiKey === '') delete next.apiKey
    if (next.modelId === '') delete next.modelId
    if (next.baseUrl === '') delete next.baseUrl
    this.config = next
    await this.persist()
    return this.view()
  }

  async clear(): Promise<ModelConfigView> {
    this.config = null
    const { rm } = await import('node:fs/promises')
    await rm(this.path, { force: true }).catch(() => {})
    return null
  }

  private async persist(): Promise<void> {
    if (!this.encryptor.isAvailable()) {
      throw new Error('OS keychain unavailable — cannot store the model key securely.')
    }
    const { writeFile, rename, chmod } = await import('node:fs/promises')
    const tmp = `${this.path}.tmp`
    const payload = this.encryptor.encrypt(JSON.stringify(this.config))
    await writeFile(tmp, payload)
    await chmod(tmp, 0o600)
    await rename(tmp, this.path)
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) (out as Record<string, unknown>)[key] = val
  }
  return out
}
