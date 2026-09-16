---
name: electron-vite
description: electron-vite build config for this repo — main/preload/renderer targets, CJS preload inside the ESM project, utility-process ?modulePath imports, exact version pins (electron-vite 5 + Vite 7, NOT Vite 8). Use when touching electron.vite.config.ts, package.json scripts/versions, build output (out/), preload bundling, engine forking, or adding dependencies to main/preload/engine.
---

# electron-vite build tooling (this repo)

Read first: `docs/ARCHITECTURE.md` (process model), `docs/DECISIONS.md` (D3, D4, D12).

## Locked pins and why (verified 2026-09-16 against npm peer ranges)

| Package | Pin | Constraint that forces it |
|---|---|---|
| electron | 44.4.x | Current stable; supported window = latest 3 majors (44/43/42) |
| electron-vite | 5.0.0 | Latest stable. **Peer range: vite ^5 \|\| ^6 \|\| ^7** |
| vite | 7.3.6 | Newest allowed by electron-vite 5. **Vite 8 is NOT allowed** until electron-vite 6 goes stable (6.0.0-beta exists, supports vite ^8) |
| @vitejs/plugin-react | 5.2.0 | v6 requires vite ^8 |
| typescript | 5.9.3 | **TS 7.0.x is npm-latest but typescript-eslint 8.70 peers typescript <6.1** — TS 7 breaks lint. Revisit with the electron-vite 6 upgrade |

Never `npm install <pkg>@latest` blindly here. Check peer ranges (`npm view <pkg> peerDependencies`) and bump deliberately; Dependabot opens the upgrade PRs.

## Critical config facts

### ESM project + CJS preload (the combination that matters)

- `package.json` has `"type": "module"` → main process bundles as ESM. Preload CANNOT be ESM: ESM preload requires `sandbox: false`, which violates our security posture.
- Therefore `electron.vite.config.ts` forces the preload target to CommonJS with explicit `.cjs` filenames (`output.format: 'cjs'`, `entryFileNames: '[name].cjs'`).
- Renderer is standard Vite ESM, unaffected.
- Main uses `import.meta.dirname` (Node 24 in Electron 44), not `__dirname`.
- The BrowserWindow preload path must be `../preload/index.cjs` — keep in sync with the output config.

### Utility process entry (`src/engine/`)

- Main imports the engine entry with the `?modulePath` suffix: `import enginePath from '../engine/index?modulePath'`, then `utilityProcess.fork(enginePath)`. The plugin emits the engine as its own chunk and resolves the runtime path.
- Type declaration for the suffix lives in `src/main/env.d.ts`.
- `utilityProcess.fork` supports ESM entries (Electron 28+); under `"type": "module"` the engine chunk is ESM. Good — M3's pi packages are ESM-only.
- **At M3, decide: bundle pi deps INTO the engine chunk vs `externalizeDepsPlugin()` on the main build.** Bundling keeps the engine self-contained (recommended); externalizing mirrors the official electron-vite template. Record the decision in DECISIONS.md when made. (Deferred, not forgotten — flagged in D12.)

### CSP handling

`src/renderer/index.html` contains a `__CSP__` placeholder; the `csp()` plugin in `electron.vite.config.ts` swaps in `CSP_PROD` / `CSP_DEV` from `src/shared/csp.ts`. Dev needs `'unsafe-inline'` in script-src (React refresh preamble) and `connect-src ws:` (Vite HMR). Production script-src stays `'self'` only. `tests/security-config.test.ts` asserts the production policy — update that test if you touch these strings.

## Scripts

- `npm run dev` — electron-vite dev (HMR renderer, hot-restart main/preload). Dev URL arrives via `process.env.ELECTRON_RENDERER_URL` — that is our `is.dev` signal for loadURL vs loadFile.
- `npm run build` — bundles all three targets into `out/`.
- `npm run typecheck` — two tsconfigs: `tsconfig.node.json` (main/preload/engine/shared/tests/configs) and `tsconfig.web.json` (renderer + shared). Keep new files inside one of those `include` sets or typecheck silently skips them.
- Renderer-only files outside `src/renderer` need explicit inclusion (shared/ is included in BOTH tsconfigs — keep shared/ free of electron and DOM imports).

## Red flags

- Setting `sandbox: false` "to make preload ESM work" — wrong fix; preload must stay CJS.
- Adding a dep to `dependencies` that only the renderer uses — renderer deps get bundled by Vite; keep them in devDependencies unless needed at runtime in main/engine (electron-builder ships `dependencies` — matters from M5).
- Importing `electron` in `src/shared/` or `src/renderer/` — shared must stay process-agnostic, renderer must stay Node-free.
- Hardcoding `out/main/index.mjs`-style paths — verify the emitted filename in `out/` after build before wiring `"main"` or preload paths.
- Upgrading vite to 8 while electron-vite is still 5.x — peer conflict, subtle breakage.

## Sources

- electron-vite docs (dev, ESM support, multithreading): https://electron-vite.org/guide/
- npm peer ranges verified 2026-09-16 (electron-vite 5.0.0, typescript-eslint 8.70.0, vitest 5.0.1, @tailwindcss/vite 4.3.3)
- Official scaffolder for reference (we hand-rolled instead, see D12): `npm create @quick-start/electron@latest -- --template react-ts`
