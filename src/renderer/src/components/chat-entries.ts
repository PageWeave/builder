import type { EngineEvent, HistoryMessage } from '../../../shared/engine-events'
import { isAllowedExternalUrl } from '../../../shared/confirm-urls'

/**
 * Pure chat transcript model: engine events → render entries. The product
 * Chat (and tests) use this reducer; both share the same URL allowlist as
 * main via src/shared/confirm-urls.ts.
 */

export interface ChatToolCall {
  callId: string
  name: string
  status: 'running' | 'ok' | 'failed'
  outputPreview?: string
  /** Set when the output carries an allowlisted workflow/confirmation URL. */
  confirmUrl?: string
}

export type ChatEntry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string; thinking?: string; streaming: boolean }
  | { id: number; kind: 'thinking'; text: string }
  | { id: number; kind: 'tool'; tool: ChatToolCall }
  | { id: number; kind: 'confirm'; url: string }
  | { id: number; kind: 'status'; text: string }
  | { id: number; kind: 'error'; text: string }

export function extractConfirmUrl(text: string): string | undefined {
  const matches = text.matchAll(/https:\/\/[^\s"'<>)]+/g)
  for (const match of matches) {
    const url = match[0]?.replace(/[.,;]+$/, '')
    if (url !== undefined && isAllowedExternalUrl(url)) return url
  }
  return undefined
}

let entrySeq = 0
export function resetEntryIds(): void {
  entrySeq = 0
}
function nextEntryId(): number {
  entrySeq += 1
  return entrySeq
}

/** Fresh transcript state (also used when a session opens/switches). */
export function freshEntries(): ChatEntry[] {
  resetEntryIds()
  return []
}

/** Builds the user's own message entry (composer/shell-originated). */
export function userEntry(text: string): ChatEntry {
  return { id: nextEntryId(), kind: 'user', text }
}

/** Applies one engine event to the transcript. Pure in/out. */
export function applyChatEvent(entries: ChatEntry[], event: EngineEvent): ChatEntry[] {
  switch (event.type) {
    case 'text_delta':
      return appendToLastAssistant(entries, event.delta)
    case 'thinking_delta':
      return appendToLastThinking(entries, event.delta)
    case 'agent_start':
      return settleStreaming(entries)
    case 'agent_end':
      return settleStreaming(entries)
    case 'tool_start':
      return [
        ...entries,
        {
          id: nextEntryId(),
          kind: 'tool',
          tool: { callId: event.callId, name: event.name, status: 'running' },
        },
      ]
    case 'tool_end': {
      return settleTool(entries, event.callId, (tool) => {
        const updated: ChatToolCall = { ...tool, status: event.isError ? 'failed' : 'ok' }
        if (event.outputPreview) updated.outputPreview = event.outputPreview
        const confirmUrl = extractConfirmUrl(event.outputPreview ?? '')
        if (confirmUrl !== undefined) updated.confirmUrl = confirmUrl
        return updated
      }).flatMap((entry) => {
        // Confirmation is NEVER buried in a collapsed card — it gets its own
        // always-visible row (non-technical users must see the action).
        if (entry.kind === 'tool' && entry.tool.confirmUrl !== undefined && !hasConfirm(entries, entry.tool.callId)) {
          return [entry, { id: nextEntryId(), kind: 'confirm', url: entry.tool.confirmUrl }]
        }
        return [entry]
      })
    }
    case 'status':
      return [...entries, { id: nextEntryId(), kind: 'status', text: event.message }]
    case 'error':
      return [...entries, { id: nextEntryId(), kind: 'error', text: event.message }]
    case 'session':
      return freshEntries()
    case 'history':
      return buildFromHistory(event.messages)
    default:
      return entries
  }
}

/** True when a confirm row for this callId was already appended (no duplicates). */
function hasConfirm(entries: ChatEntry[], callId: string): boolean {
  return entries.some(
    (entry) =>
      entry.kind === 'confirm' &&
      entries.some((e) => e.kind === 'tool' && e.tool.callId === callId && e.tool.confirmUrl === entry.url),
  )
}

function appendToLastAssistant(entries: ChatEntry[], delta: string): ChatEntry[] {
  const last = entries[entries.length - 1]
  if (last && last.kind === 'assistant' && last.streaming) {
    return [...entries.slice(0, -1), { ...last, text: last.text + delta }]
  }
  return [...entries, { id: nextEntryId(), kind: 'assistant', text: delta, streaming: true }]
}

function appendToLastThinking(entries: ChatEntry[], delta: string): ChatEntry[] {
  const last = entries[entries.length - 1]
  if (last && last.kind === 'thinking') {
    return [...entries.slice(0, -1), { ...last, text: last.text + delta }]
  }
  return [...entries, { id: nextEntryId(), kind: 'thinking', text: delta }]
}

/** Marks every streaming assistant entry as settled (run finished). */
function settleStreaming(entries: ChatEntry[]): ChatEntry[] {
  return entries.map((entry) => (entry.kind === 'assistant' && entry.streaming ? { ...entry, streaming: false } : entry))
}

function settleTool(
  entries: ChatEntry[],
  callId: string,
  update: (tool: ChatToolCall) => ChatToolCall,
): ChatEntry[] {
  const index = [...entries].reverse().findIndex((entry) => entry.kind === 'tool' && entry.tool.callId === callId)
  if (index === -1) return entries
  const realIndex = entries.length - 1 - index
  const target = entries[realIndex]
  if (!target || target.kind !== 'tool') return entries
  const updated = update(target.tool)
  return [...entries.slice(0, realIndex), { ...target, tool: updated }, ...entries.slice(realIndex + 1)]
}

/** Rebuilds the transcript from a history backfill event. */
export function buildFromHistory(messages: HistoryMessage[]): ChatEntry[] {
  const out: ChatEntry[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ id: nextEntryId(), kind: 'user', text: message.text })
      continue
    }
    out.push({
      id: nextEntryId(),
      kind: 'assistant',
      text: message.text,
      ...(message.thinking !== undefined ? { thinking: message.thinking } : {}),
      streaming: false,
    })
    for (const call of message.toolCalls ?? []) {
      const confirmUrl = extractConfirmUrl(call.outputPreview ?? '')
      out.push({
        id: nextEntryId(),
        kind: 'tool',
        tool: {
          callId: call.id,
          name: call.name,
          status: call.isError ? 'failed' : 'ok',
          ...(call.outputPreview !== undefined ? { outputPreview: call.outputPreview } : {}),
          ...(confirmUrl !== undefined ? { confirmUrl } : {}),
        },
      })
      if (confirmUrl !== undefined) {
        out.push({ id: nextEntryId(), kind: 'confirm', url: confirmUrl })
      }
    }
  }
  return out
}
