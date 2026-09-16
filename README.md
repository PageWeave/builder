# PageWeave Builder

Desktop app for building websites on [PageWeave](https://pageweave.dev) with a local AI agent — designed for **non-technical users**: download, sign in, pick a site, chat. No MCP, skills, prompts, or API keys concepts ever surface in the UX (model setup happens once, in a guided flow).

**Status: pre-development (M0 complete — planning docs only).** No code yet.

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
