---
name: electron-ipc
description: Typed IPC patterns for this repo — channel map in src/shared/ipc.ts as single source of truth, contextBridge window.pw surface, handle/invoke only, MessageChannelMain streaming to the engine utility process (port.start() gotcha), requestId correlation, main-side input validation, listener cleanup. Use when adding/changing any IPC channel, preload API, engine↔main message, or debugging messages that don't arrive.
---

# Typed IPC (this repo)

Read first: `docs/ARCHITECTURE.md` § Data flows, `src/shared/ipc.ts`.

## The contract

- `src/shared/ipc.ts` is the ONLY place channel names and payload types live. Both sides import it (renderer via tsconfig.web, main/preload/engine via tsconfig.node). No raw channel string literals anywhere else.
- `PwBridge` in shared/ipc.ts defines the entire `window.pw` surface. Preload implements it; renderer consumes it via `src/renderer/src/env.d.ts`'s `Window` augmentation. Adding a feature = extend `PwBridge` + `IpcChannel` + preload + main handler together.
- Request/response ALWAYS `ipcMain.handle` + `ipcRenderer.invoke`. No `sendSync` (blocks the renderer), no fire-and-forget `send` unless genuinely no-response flows (engine streaming events at M3 are MessagePort, not ipcRenderer.send).

## Main-side validation (mandatory)

Every handler validates payload shape before use — renderer input is untrusted:

```ts
ipcMain.handle(IpcChannel.enginePing, (_e, req: unknown) => {
  if (!isPingRequest(req)) throw new Error('invalid ping request')
  return engineHost.ping(req)
})
```

Hand-rolled type guards are fine at this scale; adopt zod only if payload complexity explodes (not planned).

## Engine (utility process) channel

- Main creates a `MessageChannelMain` pair; `port1` goes to the engine via `child.postMessage(msg, [port1])`, main keeps `port2`.
- **Gotchas that will bite:**
  - Ports transfer ONLY via `postMessage` — never `send`/`invoke`.
  - Main side must call `port2.start()` or messages never flow.
  - Engine receives the port on `process.parentPort.on('message', e => e.ports[0])`.
  - Correlate requests with a `requestId` map (`EngineRequest`/`EngineResponse` envelopes in shared/ipc.ts); wrap pings in a timeout so a dead engine rejects instead of hanging the renderer promise.
  - `port.close` fires when the remote end dies — clean pending requests on engine exit, don't leak the promise map across restarts.
- Engine-side code lives in `src/engine/` and must stay free of `electron` imports (it runs as plain Node; `process.parentPort` is the only channel API).

## Renderer-side rules

- Only call methods on `window.pw` — never `window.electron`, never `ipcRenderer`.
- Preload `on`-style subscriptions (M3 event stream) MUST return an unsubscribe function; components clean up on unmount or listeners leak and double-fire.
- Renderer never talks to MCP, providers, or the filesystem. Everything goes main ↔ engine.

## Engine surface (M3, implemented)

- Requests: `ping · configure · token-updated · open-session · prompt · steer · abort · list-models` — each with a paired response kind in `EngineResponse` (asserted by tests/ipc-contract.test.ts's request→response map). Per-kind timeouts live in `EngineHost.REQUEST_TIMEOUT_MS`; `prompt` responds on acceptance only — completion arrives as events, never as the response.
- One-way notices (no requestId): `{ kind: 'ready' }` and `{ kind: 'event', event }` — EngineHost fans events out to listeners; main broadcasts to windows via `IpcChannel.engineEvent`. Renderer subscribes via `window.pw.engine.onEvent` (returns unsubscribe).
- Secrets ride ONLY in `configure`/`token-updated` payloads over the MessagePort — never spawn args (ps-visible), never the init envelope, never the renderer.
- Crash restart replays the last `configure` + `open-session` (EngineHost keeps both).

## Testing

- Contract test: `tests/ipc-contract.test.ts` asserts channel constants + envelope-kind pairing from shared/ipc.ts.
- Handler logic: extract pure functions (validation, envelope shaping) and unit-test them — do NOT unit-test the ipcMain plumbing itself; the framework owns message passing (agents-inc desktop-testing pattern). E2E through real IPC lands with Playwright at M4.

## Red flags

- New channel name not in `IpcChannel` ("just this once" literal).
- Payload typed but never validated at runtime in main.
- Subscribing in preload without returning an unsubscribe.
- Business logic creeping into preload (preload = thin typed forwarder only).
- Direct renderer↔renderer messaging (route through main or MessagePort).

## Sources

- Electron message-ports tutorial: https://electronjs.org/docs/latest/tutorial/message-ports
- utilityProcess API: https://electronjs.org/docs/latest/api/utility-process
- agents-inc `desktop-ipc-electron` skill (pattern taxonomy + gotchas)
