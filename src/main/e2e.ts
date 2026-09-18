/**
 * E2E-only canned data and gates (PW_E2E=1). Playwright `_electron` drives
 * the real app shell, IPC, and event plumbing end-to-end; everything that
 * needs a display, a keyring, a live browser, or the network is stubbed at
 * the IPC boundary with explicit, local canned data. The engine process
 * itself boots for real (ping self-check proves it) — only prompt/site
 * responses are canned, because those need a real model key and the live
 * PageWeave server. Never enable this in packaged builds.
 */
import type { ConversationSummary, ModelConfigView, WebsiteSummary } from '../shared/ipc'
import type { EngineEvent } from '../shared/engine-events'

export function isE2E(): boolean {
  return process.env.PW_E2E === '1'
}

export const E2E_MODEL_VIEW: ModelConfigView = {
  provider: 'custom',
  modelId: 'e2e-model',
  baseUrl: 'https://e2e.invalid/v1',
}

/** Gate state: no model until the E2E run "connects" one. */
let e2eModelSaved = false

export function e2eModelView(): ModelConfigView {
  return e2eModelSaved ? E2E_MODEL_VIEW : null
}

export function e2eSaveModel(): ModelConfigView {
  e2eModelSaved = true
  return E2E_MODEL_VIEW
}

export const E2E_SITES: WebsiteSummary[] = [
  {
    id: 'e2e-site-1',
    name: 'Demo Site',
    devUrl: 'https://demo.env.pageweave.site',
    liveUrl: 'https://demo.pageweave.site',
  },
]

export const E2E_CONVERSATIONS: ConversationSummary[] = [
  {
    path: '/tmp/pageweave-builder-e2e/work/e2e-site-1/sessions/demo.jsonl',
    id: 'e2e-session-1',
    firstMessage: 'Create the marketing site',
    modified: new Date().toISOString(),
    messageCount: 4,
  },
]

export const E2E_SESSION_ID = 'e2e-session-1'

/** Canned streaming run: text → tool with a confirmation URL → completion. */
export function e2ePromptEvents(): EngineEvent[] {
  return [
    { type: 'agent_start' },
    { type: 'text_delta', delta: "Here's the hero update — " },
    { type: 'tool_start', callId: 'e2e-t1', name: 'mcp__pageweave__update_page' },
    {
      type: 'tool_end',
      callId: 'e2e-t1',
      name: 'mcp__pageweave__update_page',
      isError: false,
      outputPreview: 'update applied — review: https://pageweave.dev/workflow/confirm/e2e',
    },
    { type: 'text_delta', delta: 'done!' },
    { type: 'agent_end' },
  ]
}
