/**
 * Single source of truth for the renderer↔main IPC contract and the
 * renderer↔main↔engine message envelopes.
 *
 * Both sides import from here (main/preload/engine via tsconfig.node.json,
 * renderer via tsconfig.web.json). Channel names are only ever referenced
 * through `IpcChannel` — never as raw string literals (see .opencode/skills
 * /electron-ipc/SKILL.md).
 */

/** Channels the renderer may invoke in the main process. */
export const IpcChannel = {
  /** End-to-end liveness check: renderer → main → engine → back. */
  enginePing: 'engine:ping',
  /** Static app/runtime versions. */
  appVersions: 'app:versions',
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Request payload for `IpcChannel.enginePing`. */
export interface PingRequest {
  message: string
  sentAt: number
}

/** Response payload for `IpcChannel.enginePing`. */
export interface PongResponse {
  echo: string
  sentAt: number
  pongedAt: number
  source: 'engine'
}

/** Response payload for `IpcChannel.appVersions`. */
export interface AppVersions {
  app: string
  electron: string
  node: string
}

/**
 * The full bridge surface exposed as `window.pw` by the preload script.
 * Renderer code may only ever call methods on this interface.
 */
export interface PwBridge {
  engine: {
    ping(req: PingRequest): Promise<PongResponse>
  }
  app: {
    versions(): Promise<AppVersions>
  }
}

/* ------------------------------------------------------------------------- */
/* Engine (utility process) ↔ main envelopes, carried over MessagePort.       */
/* ------------------------------------------------------------------------- */

export type EngineRequest =
  | { kind: 'ping'; requestId: string; payload: PingRequest }

export type EngineResponse =
  | { kind: 'pong'; requestId: string; payload: PongResponse }
  | { kind: 'error'; requestId: string; message: string }

/** Every valid engine request kind, and its paired response kind. */
export const ENGINE_REQUEST_KINDS = ['ping'] as const
export type EngineRequestKind = (typeof ENGINE_REQUEST_KINDS)[number]
export const ENGINE_RESPONSE_KINDS = ['pong', 'error'] as const
export type EngineResponseKind = (typeof ENGINE_RESPONSE_KINDS)[number]
