import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { classifyCallback, escapeHtml } from './protocol'

/** RFC 8252 §8.3: open the port when the flow starts, close it right after. */
export const CALLBACK_TIMEOUT_MS = 5 * 60_000

const PAGE_STYLE =
  'body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f4;color:#1c1917}' +
  'main{text-align:center;padding:2rem;max-width:28rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;opacity:.7}'

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>` +
    `<body><main><h1>${escapeHtml(title)}</h1><p>${body}</p></main></body></html>`
}

const SUCCESS_PAGE = page(
  'Signed in',
  'You are signed in — you can close this tab and return to PageWeave Builder.',
)

function errorPage(message: string): string {
  return page('Sign-in problem', escapeHtml(message))
}

interface PendingCallback {
  expectedState: string
  resolve: (url: URL) => void
  reject: (err: Error) => void
  done: boolean
}

/**
 * One-shot loopback HTTP server for the OAuth callback. Binds 127.0.0.1 on an
 * ephemeral port (RFC 8252 §7.3). Only ever accepts a single /callback request
 * whose `state` matches the pending flow — everything else is answered and
 * dropped without settling the promise (mismatched state = 400, keep waiting).
 * The caller MUST close() when the flow ends (success, error, or timeout).
 */
export class LoopbackServer {
  private server: Server | null = null
  private port = 0
  private pending: PendingCallback | null = null

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        this.onRequest(req, res)
      })
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr === null || typeof addr === 'string') {
          reject(new Error('loopback server failed to bind'))
          return
        }
        this.server = server
        this.port = addr.port
        resolve(this.port)
      })
    })
  }

  /** Waits for the (single) valid callback. Rejects on error redirect or timeout. */
  waitCallback(expectedState: string, timeoutMs = CALLBACK_TIMEOUT_MS): Promise<URL> {
    if (!this.server) throw new Error('loopback server not started')
    if (this.pending) throw new Error('loopback server already has a pending flow')
    return new Promise<URL>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(new Error('Sign-in timed out — no callback from the browser. Please try again.'))
      }, timeoutMs)
      timer.unref()
      this.pending = {
        expectedState,
        resolve: (url) => {
          clearTimeout(timer)
          resolve(url)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
        done: false,
      }
    })
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = null
    this.pending = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private settle(result: URL | Error): void {
    const pending = this.pending
    if (!pending || pending.done) return
    pending.done = true
    if (result instanceof Error) pending.reject(result)
    else pending.resolve(result)
    // Port stays open until the controller's finally-close; new requests get 503.
  }

  private onRequest(req: IncomingMessage, res: ServerResponse): void {
    const base = `http://127.0.0.1:${this.port}`
    if (req.method !== 'GET') {
      this.respond(res, 405, errorPage('Method not allowed.'))
      return
    }
    let url: URL
    try {
      url = new URL(req.url ?? '/', base)
    } catch {
      this.respond(res, 400, errorPage('Malformed request.'))
      return
    }
    if (!this.pending || this.pending.done) {
      this.respond(res, 503, errorPage('No sign-in flow is in progress.'))
      return
    }
    const classified = classifyCallback(url, this.pending.expectedState)
    switch (classified.kind) {
      case 'not-callback':
        this.respond(res, 404, errorPage('Not found.'))
        return
      case 'state-mismatch':
        // Forged or stale redirect: answer 400 and KEEP waiting for the real one.
        this.respond(res, 400, errorPage('This sign-in response is no longer valid.'))
        return
      case 'error': {
        const message = classified.description
          ? `${classified.error}: ${classified.description}`
          : `The sign-in was not completed (${classified.error}).`
        this.respond(res, 200, errorPage(message))
        this.settle(new Error(message))
        return
      }
      case 'success':
        this.respond(res, 200, SUCCESS_PAGE)
        this.settle(url)
        return
    }
  }

  private respond(res: ServerResponse, status: number, html: string): void {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html)
  }
}
