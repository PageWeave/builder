---
name: renderer-ui
description: Renderer UI stack for this repo — React 19, Tailwind 4 CSS-first config, daisyUI 5 semantic tokens and components, sandboxed renderer rules (window.pw only, no Node), data-theme theming. Use when building or styling any component in src/renderer, touching index.css / theme / daisyUI configuration, adding dependencies to the renderer, or reviewing UI code.
---

# Renderer UI: React 19 + Tailwind 4 + daisyUI 5

Read first: `docs/ARCHITECTURE.md` § Renderer, `docs/DECISIONS.md` D6 (UI scope).

## Stack facts

- React 19.3 (function components + hooks only; no class components). `@vitejs/plugin-react` 5.2 (v6 needs Vite 8 — see electron-vite skill).
- Tailwind 4 is **CSS-first**: `src/renderer/src/index.css` starts with `@import "tailwindcss";` and `@plugin "daisyui";`. There is NO tailwind.config.js — theme customization goes in CSS via `@theme` blocks.
- daisyUI 5.7 (compile-time CSS plugin, zero JS runtime — no renderer security surface). Semantic tokens ONLY: `primary`, `base-100`, `base-content`, `error`, etc. Never raw Tailwind color names (`blue-500`) — that's the platform convention too (pageweave repo) and keeps theme switching working.
- Theme: `<html data-theme="...">` in index.html. App look is its own; do not copy site themes.

## Sandboxed renderer rules (security posture, not style)

- No Node access. The ONLY privileged surface is `window.pw` (typed in `src/renderer/src/env.d.ts`, defined in `src/shared/ipc.ts`).
- Never import from `src/main`, `src/preload`, `src/engine`, or `electron` — tsconfig.web doesn't include them; keep it that way.
- `src/shared/` is the only cross-boundary import, and it must stay electron-free/DOM-free (both tsconfigs compile it).
- CSP: prod `script-src 'self'` — no inline scripts in JSX beyond what React emits, no `dangerouslySetInnerHTML` with untrusted content (agent chat text is untrusted → render as markdown via a sanitizer at M4, never raw HTML).

## Conventions

- Components in `src/renderer/src/`; keep M1 placeholders dumb. Product UI structure lands at M4 per D6 (chat, site picker, preview, model connect — nothing else; feature requests beyond that go through D6 revision, not silent scope creep).
- Async bridge calls: handle loading + error states visibly — the audience is non-technical users ("could my parent use this?" is the bar). Error text in plain language, never raw IPC/stack output.
- Escape user/agent text before rendering (see feedback-widget rule in MCP instructions if agent content ever renders).
- Styling: daisyUI component classes (`btn`, `card`, `chat-bubble`, `alert`) + Tailwind utilities for layout. Consistent with preview sites the user sees.

## Testing renderer code

- M1: none beyond the bridge working (placeholders).
- M4 decision (record in DECISIONS): **Vitest Browser Mode** (`vitest-browser-react`) for interaction-heavy components — real Chromium, stable since Vitest 4; jsdom only for pure-logic tests if any. Playwright `_electron` E2E covers real integration. Do NOT add jsdom + Testing Library as a default — it's the tool we'd migrate away from.

## Red flags

- Tailwind color utilities instead of daisyUI semantic tokens.
- A `tailwind.config.js` appearing (v3 habit) — v4 is CSS-first.
- Importing shared types from preload/main paths instead of `src/shared`.
- Raw HTML injection for chat/markdown content.
- Adding renderer deps without checking they're browser-only (no node builtins — sandbox has no Node).

## Sources

- Tailwind 4 CSS-first docs: https://tailwindcss.com/docs
- daisyUI 5 install (Tailwind plugin form): https://daisyui.com/docs/
- Vitest Browser Mode guide: https://vitest.dev/guide/browser/
