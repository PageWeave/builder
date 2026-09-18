import type { McpAdapterConfig, McpAdapterServerEntry } from './pi-mcp-adapter-config'

/**
 * Pure builder for the isolated pi-mcp-adapter config. The access token is
 * NEVER placed in the config — the adapter interpolates `${PW_ACCESS_TOKEN}`
 * from the engine's environment at connection time, and main pushes rotated
 * tokens into that env var over the MessagePort (see DECISIONS D13/D14 and
 * docs/SPEC-PLATFORM.md § OAuth token lifetime).
 */

export const PAGEWEAVE_MCP_URL = 'https://pageweave.dev/mcp'
export const ACCESS_TOKEN_ENV = 'PW_ACCESS_TOKEN'

/** Chosen per DECISIONS D14 after measuring both modes against the live server. */
export const DIRECT_TOOLS_MODE = true as const

export function buildMcpAdapterConfig(): McpAdapterConfig {
  const pageweave: McpAdapterServerEntry = {
    url: PAGEWEAVE_MCP_URL,
    auth: 'bearer',
    bearerToken: `\${${ACCESS_TOKEN_ENV}}`,
    lifecycle: 'lazy',
    directTools: DIRECT_TOOLS_MODE,
    requestTimeoutMs: 120_000,
  }
  return {
    mcpServers: { pageweave: pageweave },
    settings: {
      // Keep the system-prompt prefix stable for provider prompt caching.
      freezeDirectTools: true,
      // No embedded UI in the app for sampling/elicitation dialogs in v1.
      sampling: false,
      elicitation: false,
      // Keep the multi-call scripting tool available for bulk operations.
      scriptMode: true,
      requestTimeoutMs: 120_000,
    },
  }
}
