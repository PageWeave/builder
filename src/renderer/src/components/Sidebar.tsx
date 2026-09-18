import { useState } from 'react'
import type { ConversationSummary, WebsiteSummary } from '../../../shared/ipc'

interface SidebarProps {
  /** null = loading. */
  sites: WebsiteSummary[] | null
  sitesLoading: boolean
  sitesError: string | null
  onRefreshSites: () => void
  activeSite: WebsiteSummary | null
  onSelectSite: (site: WebsiteSummary) => void
  conversations: ConversationSummary[] | null
  activeSessionId: string | null
  onSwitchConversation: (conversation: ConversationSummary) => void
  onNewChat: () => void
  /** Site creation runs as a guided chat prompt (D6 scope). */
  onCreateSite: (name: string) => void
  canCreateSite: boolean
}

/** Relative "time ago" for the conversation list. */
function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d ago`
  return new Date(then).toLocaleDateString()
}

export default function Sidebar(props: SidebarProps): React.JSX.Element {
  const {
    sites,
    sitesLoading,
    sitesError,
    onRefreshSites,
    activeSite,
    onSelectSite,
    conversations,
    activeSessionId,
    onSwitchConversation,
    onNewChat,
    onCreateSite,
    canCreateSite,
  } = props

  const [creating, setCreating] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')

  const submitCreate = (): void => {
    const name = newSiteName.trim()
    if (name.length === 0) return
    onCreateSite(name)
    setNewSiteName('')
    setCreating(false)
  }

  return (
    <aside className="flex h-full flex-col bg-base-100">
      {/* Sites section */}
      <div className="flex items-center px-3 pt-3 pb-1">
        <h2 className="text-xs font-semibold uppercase opacity-60">Sites</h2>
        <button
          type="button"
          className="btn btn-ghost btn-xs ml-auto"
          title="Refresh site list"
          onClick={onRefreshSites}
        >
          {sitesLoading ? <span className="loading loading-spinner loading-xs" /> : '↻'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sitesError && <div className="alert alert-error mx-1 py-2 text-xs"><span>{sitesError}</span></div>}
        {sites === null && !sitesError && (
          <p className="px-2 py-2 text-xs opacity-50">Loading your sites…</p>
        )}
        {sites !== null && sites.length === 0 && (
          <p className="px-2 py-2 text-xs opacity-50">
            No sites yet. Create one below — the agent sets it up with you.
          </p>
        )}
        <ul className="menu w-full gap-0.5 p-0">
          {sites?.map((site) => (
            <li key={site.id}>
              <button
                type="button"
                className={`justify-between text-sm ${activeSite?.id === site.id ? 'menu-active' : ''}`}
                onClick={() => onSelectSite(site)}
              >
                <span className="truncate">{site.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Create-site (guided chat prompt — D6 scope) */}
      <div className="border-t border-base-300 px-3 py-2">
        {creating ? (
          <div className="space-y-2">
            <input
              className="input input-bordered input-sm w-full"
              placeholder="What should the site be called?"
              value={newSiteName}
              autoFocus
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            <div className="flex gap-1">
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={newSiteName.trim().length === 0}
                onClick={submitCreate}
              >
                Start
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-xs w-full"
            title={canCreateSite ? undefined : 'Sign in and connect a model first'}
            disabled={!canCreateSite}
            onClick={() => setCreating(true)}
          >
            + New site
          </button>
        )}
      </div>

      {/* Conversations section for the active site */}
      {activeSite && (
        <div className="flex h-2/5 flex-col border-t border-base-300">
          <div className="flex items-center px-3 py-2">
            <h2 className="text-xs font-semibold uppercase opacity-60">Conversations</h2>
            <button type="button" className="btn btn-ghost btn-xs ml-auto" onClick={onNewChat} title="Start a new conversation">
              + New chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {conversations === null && <p className="px-2 text-xs opacity-50">Loading…</p>}
            {conversations !== null && conversations.length === 0 && (
              <p className="px-2 text-xs opacity-50">No conversations yet.</p>
            )}
            <ul className="menu w-full gap-0.5 p-0">
              {conversations?.map((conversation) => (
                <li key={conversation.path}>
                  <button
                    type="button"
                    className={`justify-between text-sm ${conversation.id === activeSessionId ? 'menu-active' : ''}`}
                    onClick={() => onSwitchConversation(conversation)}
                  >
                    <span className="min-w-0 truncate">
                      {conversation.name ?? conversation.firstMessage ?? 'Conversation'}
                    </span>
                    <span className="shrink-0 pl-2 text-[10px] opacity-50">
                      {formatRelative(conversation.modified)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  )
}
