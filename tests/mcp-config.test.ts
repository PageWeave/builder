import { describe, expect, it } from 'vitest'
import { ACCESS_TOKEN_ENV, DIRECT_TOOLS_MODE, PAGEWEAVE_MCP_URL, buildMcpAdapterConfig } from '../src/engine/mcp-config'

describe('MCP adapter config (isolated snapshot)', () => {
  const config = buildMcpAdapterConfig()

  it('points at the PageWeave MCP endpoint over HTTPS bearer auth', () => {
    const server = config.mcpServers.pageweave
    expect(server).toBeDefined()
    expect(server?.url).toBe(PAGEWEAVE_MCP_URL)
    expect(PAGEWEAVE_MCP_URL).toMatch(/^https:\/\//)
    expect(server?.auth).toBe('bearer')
  })

  it('references the access token via env interpolation — never a literal token', () => {
    const server = config.mcpServers.pageweave
    expect(server?.bearerToken).toBe(`\${${ACCESS_TOKEN_ENV}}`)
    // A real token is a long opaque string; the config only ever carries the
    // env-var reference.
    const serialized = JSON.stringify(config)
    expect(serialized).not.toMatch(/Bearer [A-Za-z0-9._-]{16,}/)
  })

  it('uses lazy lifecycle and the measured directTools mode (D14)', () => {
    const server = config.mcpServers.pageweave
    expect(server?.lifecycle).toBe('lazy')
    expect(server?.directTools).toBe(DIRECT_TOOLS_MODE)
    expect(server?.directTools).toBe(true)
    expect(config.settings?.freezeDirectTools).toBe(true)
  })

  it('keeps sampling/elicitation off (no embedded UI) and the script tool on', () => {
    expect(config.settings?.sampling).toBe(false)
    expect(config.settings?.samplingAutoApprove).toBeUndefined()
    expect(config.settings?.elicitation).toBe(false)
    expect(config.settings?.scriptMode).toBe(true)
  })

  it('bounds live MCP request timeouts', () => {
    expect(config.mcpServers.pageweave?.requestTimeoutMs).toBeGreaterThan(0)
    expect(config.settings?.requestTimeoutMs).toBeGreaterThan(0)
  })
})
