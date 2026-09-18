/**
 * Local type surface for the pi-mcp-adapter config. The package ships
 * TypeScript source as its entry ("types": "./index.ts"), so letting TS
 * resolve the real types would pull the entire adapter source graph into our
 * strict typecheck. The JSON shapes here mirror adapter 2.34.0 (verified
 * against its dist/types.d.ts) and are covered by tests/mcp-config.test.ts.
 */
export interface McpAdapterServerEntry {
  url?: string
  headers?: Record<string, string>
  requestHeadersCommand?: { command: string; args?: string[]; env?: Record<string, string>; timeoutMs?: number }
  auth?: 'oauth' | 'bearer' | false
  bearerToken?: string
  bearerTokenEnv?: string
  lifecycle?: 'keep-alive' | 'lazy' | 'lazy-keep-alive' | 'eager'
  idleTimeout?: number
  requestTimeoutMs?: number
  directTools?: boolean | string[] | 'search'
  toolPrefix?: 'server' | 'none' | 'short' | 'mcp'
  includeTools?: string[]
  excludeTools?: string[]
  approveTools?: boolean | string[]
  protocolVersion?: 'legacy' | 'auto' | '2026-07-28'
  disabled?: boolean
}

export interface McpAdapterSettings {
  toolPrefix?: 'server' | 'none' | 'short' | 'mcp'
  idleTimeout?: number
  requestTimeoutMs?: number
  directTools?: boolean | 'search'
  strictDirectToolArguments?: boolean
  warnOnLargeDirectTools?: boolean
  scriptMode?: boolean
  disableProxyTool?: boolean
  freezeDirectTools?: boolean
  autoAuth?: boolean
  sampling?: boolean
  samplingAutoApprove?: boolean
  elicitation?: boolean
}

export interface McpAdapterConfig {
  mcpServers: Record<string, McpAdapterServerEntry>
  settings?: McpAdapterSettings
}

export type McpAdapterFactory = (pi: unknown) => void
