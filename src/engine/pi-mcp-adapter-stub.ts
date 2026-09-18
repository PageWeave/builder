/**
 * Typecheck-only stub for pi-mcp-adapter. tsconfig.node.json redirects the
 * 'pi-mcp-adapter' specifier here via "paths" because the real package ships
 * raw TypeScript source as its "types" entry, which would drag its whole
 * source graph (and an uninstalled pi-tui peer) into our strict typecheck.
 * Vite does NOT read tsconfig paths, so builds still bundle the real package.
 */
import type { McpAdapterConfig, McpAdapterFactory } from './pi-mcp-adapter-config'

export interface McpAdapterOptions {
  config?: McpAdapterConfig
  configPath?: string
}

export function createMcpAdapter(options?: McpAdapterOptions): McpAdapterFactory {
  void options
  throw new Error('pi-mcp-adapter stub — this module must never be executed; it exists for typecheck only')
}
