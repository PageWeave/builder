# PageWeave Builder

Desktop app for building websites on [PageWeave](https://pageweave.dev) with a local AI agent — designed for **non-technical users**: download, sign in, pick a site, chat. No MCP, skills, prompts, or API keys concepts ever surface in the UX (model setup happens once, in a guided flow).

**Status: M3 complete — the agent engine is live: Pi harness + PageWeave MCP tools (Bearer-auth), BYOK model connect, streaming event bridge, and a debug chat console.** Auth (M2) is end-to-end; product UI (site picker, preview pane, polished chat) arrives with M4. See [PLAN.md](PLAN.md) for status.

## Quick start (development)

Requirements: Node >= 22.12 (see `.nvmrc`), npm.

```bash
npm install
npm run dev                              # electron-vite dev server + app window
```

If `npm run dev` fails with `Error: Electron uninstall`, electron's binary-download postinstall was skipped or failed — run `node node_modules/electron/install.js` (or `npm install-scripts approve electron && npm ci` when your npm gates install scripts; the allowlist in package.json pre-approves esbuild + electron), then retry.
npm run lint && npm run typecheck && npm run test && npm run build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs on every push: **verify** (lint, typecheck, unit tests, build), **smoke** (launches the built app under xvfb and asserts the renderer→main→engine ping-pong self-check), and **gitleaks** (secret scan, pinned CLI — no action license needed for orgs).

## License

[AGPL-3.0-only](LICENSE) — open source; the hosted PageWeave platform remains the commercial surface.

## Start here

1. **[PLAN.md](PLAN.md)** — master plan: vision, architecture summary, current status, next actions
2. [docs/MILESTONES.md](docs/MILESTONES.md) — phased build plan M1–M6 with acceptance criteria
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Electron processes, Pi engine embedding, IPC, auth, MCP wiring
4. [docs/DECISIONS.md](docs/DECISIONS.md) — every decision with rationale (read before changing direction)
5. [docs/SPEC-PLATFORM.md](docs/SPEC-PLATFORM.md) — PageWeave platform integration points + open CONFIRM items
6. [docs/RESEARCH.md](docs/RESEARCH.md) — condensed research with sources (do not re-research)
7. [docs/RISKS.md](docs/RISKS.md) — risks and mitigations

## One-paragraph summary

PageWeave Builder is an Electron app whose agent engine is the [Pi harness](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`) embedded in a utility process as plain Node libraries. The agent edits the user's hosted PageWeave site through PageWeave's existing **remote MCP server** (via `pi-mcp-adapter`'s `createMcpAdapter`, bearer-token auth from the user's PageWeave OAuth sign-in). The UI is a custom-branded React app: chat (streaming, tool-call cards, confirmation cards), site picker, and a live preview pane pointed at the site's dev environment. Models are bring-your-own-key in v1 (Anthropic/OpenAI/Google/OpenRouter/custom OpenAI-compatible) via a guided connect flow. Power users are unaffected: they keep connecting their own harnesses (OpenCode, Claude Code, …) to the same MCP server.

## Related repos

- `~/dev/pageweave` — the PageWeave Rails platform (dashboard, MCP server, OAuth). Read its `AGENTS.md` for platform rules. Platform-side tasks this project depends on are listed in [docs/SPEC-PLATFORM.md](docs/SPEC-PLATFORM.md).
