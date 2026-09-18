import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ListWebsitesResponse, WebsiteSummary } from '../shared/ipc'
import { ACCESS_TOKEN_ENV, PAGEWEAVE_MCP_URL } from './mcp-config'

/**
 * Minimal direct MCP client for the site picker's read-only data
 * (list_websites + get_website). This is the same data plane and the same
 * auth story as the agent's pi-mcp-adapter connection — never a parallel
 * REST client (see DECISIONS D15):
 *
 * - the bearer token comes ONLY from the PW_ACCESS_TOKEN env var, which main
 *   keeps rotated in the engine process (identical to the adapter's
 *   `${PW_ACCESS_TOKEN}` interpolation);
 * - each fetch uses a short-lived client (connect → calls → close), so token
 *   rotation and the 1 h expiry never strand a long-lived connection;
 * - secrets stay inside the engine process — the response is a typed,
 *   secret-free view in src/shared/ipc.ts.
 *
 * The SDK glue (fetchWebsites) is thin glue; the pure parsers below are the
 * tested surface (upstream tool output shapes are parsed defensively).
 */

const CLIENT_INFO = { name: 'pageweave-builder', version: '0.1.0' } as const
const CALL_TIMEOUT_MS = 30_000

export async function fetchWebsites(): Promise<ListWebsitesResponse> {
  const token = process.env[ACCESS_TOKEN_ENV]
  if (!token) throw new Error('Not signed in — site data needs a PageWeave access token.')

  const client = new Client(CLIENT_INFO)
  // The SDK ships its own .d.ts compiled without exactOptionalPropertyTypes,
  // so its transport class falls just short of the Transport interface under
  // our strictness — one honest assertion at the single call site.
  const transport = new StreamableHTTPClientTransport(new URL(PAGEWEAVE_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }) as Transport
  try {
    await client.connect(transport)
    const list = await client.callTool({ name: 'list_websites', arguments: {} }, undefined, {
      timeout: CALL_TIMEOUT_MS,
    })
    const rows = extractToolJson(list)
    const websites: WebsiteSummary[] = []
    for (const summary of parseWebsiteList(rows)) {
      // Environments (preview/live URLs) come from get_website details.
      // A failing detail lookup degrades that site to no URLs, never the list.
      try {
        const detail = await client.callTool(
          { name: 'get_website', arguments: { id: summary.id } },
          undefined,
          { timeout: CALL_TIMEOUT_MS },
        )
        const website = extractToolJson(detail)
        const enriched = parseWebsiteDetail(website, summary)
        if (enriched) websites.push(enriched)
      } catch {
        websites.push(summary)
      }
    }
    return { websites }
  } finally {
    await client.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* Pure parsers (tested) — defensive against upstream shape changes.  */
/* ------------------------------------------------------------------ */

/** Extracts the JSON payload of an MCP tool result, defensively. */
export function extractToolJson(result: unknown): unknown {
  if (!isObject(result)) return null
  const structured = result.structuredContent
  if (structured !== undefined) return structured
  const content = Array.isArray(result.content) ? result.content : []
  for (const part of content) {
    if (!isObject(part) || part.type !== 'text') continue
    const text = part.text
    if (typeof text !== 'string') continue
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }
  return null
}

/** Maps a raw list_websites payload to summaries. Accepts an array or { websites: [...] }. */
export function parseWebsiteList(raw: unknown): WebsiteSummary[] {
  const rows = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw.websites)
      ? raw.websites
      : []
  const out: WebsiteSummary[] = []
  for (const row of rows) {
    if (!isObject(row)) continue
    const id = firstString(row, ['id', 'websiteId'])
    if (!id || !isSafeSiteId(id)) continue
    const name = firstString(row, ['name', 'title']) ?? firstString(row, ['subdomain']) ?? id
    out.push({ id, name })
  }
  return out
}

/** Merges a get_website payload's environment URLs into a summary. */
export function parseWebsiteDetail(raw: unknown, summary: WebsiteSummary): WebsiteSummary | null {
  if (!isObject(raw)) return null
  const environments = Array.isArray(raw.environments) ? raw.environments : []
  let devUrl: string | undefined
  let liveUrl: string | undefined
  for (const env of environments) {
    if (!isObject(env)) continue
    const url = firstString(env, ['url', 'host', 'domain'])
    if (!url) continue
    const name = stringAt(env, 'name')
    if (name === 'dev') devUrl ??= url
    if (name === 'default') liveUrl ??= url
  }
  const name = firstString(raw, ['name', 'title']) ?? summary.name
  return {
    id: summary.id,
    name,
    ...(devUrl !== undefined ? { devUrl } : {}),
    ...(liveUrl !== undefined ? { liveUrl } : {}),
  }
}

/* ------------------------------------------------------------------ */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringAt(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringAt(record, key)
    if (value !== undefined) return value
  }
  return undefined
}

/** Website ids are uuids/slugs; anything else never reaches session scoping. */
function isSafeSiteId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)
}
