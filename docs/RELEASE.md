# Releasing PageWeave Builder

How to cut a release: what CI builds, what you must provision once, and how to verify. Fresh-agent orientation: `electron-builder.yml` (packaging config), `.github/workflows/release.yml` (pipeline), D17 (decisions + rationale).

## Version → release flow

1. The single version source is `package.json` `version` (semver).
2. Bump, commit, tag `v<version>` (e.g. `v0.1.0`), push the tag:
   ```
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. The **Release** workflow runs on the tag: macOS job (universal dmg) + Windows job (NSIS x64) → both `--publish always` → a **draft GitHub Release** with installers + `latest.yml` / `latest-mac.yml` feed files.
4. Drafts are the staging area: **nothing updates for users until you publish the draft.** Test the artifacts, write release notes, publish.

## One-time: signing secrets (repo → Settings → Secrets and variables → Actions)

Without these the pipeline still builds **unsigned** drafts (Gatekeeper/SmartScreen will warn users — fine for dry runs, not for real users).

| Secret | What it is | Where it comes from |
|---|---|---|
| `MAC_CSC_LINK` | Base64 of the **Developer ID Application** `.p12` cert | Apple Developer account → Certificates |
| `MAC_CSC_KEY_PASSWORD` | Password of that `.p12` | Chosen at export |
| `APPLE_ID` | Apple ID email for notarization | Your Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (not the account password) | appleid.apple.com → Sign-In and Security |
| `APPLE_TEAM_ID` | 10-char team id | Apple Developer membership details |
| `WIN_CSC_LINK` | Base64 of the Windows code-signing `.p12`/`.pfx` (OV or EV per your CA) | CA of choice (Sectigo, DigiCert, SSL.com…) |
| `WIN_CSC_KEY_PASSWORD` | Password of that `.p12`/`.pfx` | Chosen at export |

`GH_TOKEN` uses the built-in `GITHUB_TOKEN` (workflow has `contents: write`). electron-builder notarizes automatically when `mac.notarize: true` + the `APPLE_*` trio are present; Windows signing happens when `CSC_*` are present. Keep cert `.p12` files out of the repo — CI-only secrets, gitleaks watches the tree.

## What a release contains

- `PageWeave-Builder-<version>.dmg` — universal (Intel + Apple Silicon), signed + notarized
- `PageWeave Builder Setup <version>.exe` — NSIS one-click, per-user install (no admin prompt)
- `latest-mac.yml` / `latest.yml` (+ `.blockmap` deltas) — the electron-updater feed; **generated automatically, never edit by hand**

## Verifying a draft before publishing

**macOS** (on a clean-ish machine):
```
codesign --verify --deep --strict -v /Applications/PageWeave\ Builder.app
spctl -a -vv /Applications/PageWeave\ Builder.app   # must say "accepted", source "Notarized Developer ID"
```
**Windows** (PowerShell): `Get-AuthenticodeSignature '.\PageWeave Builder Setup X.Y.Z.exe' | Format-List` → Status `Valid`.

**Both:** install fresh → sign in → run one real prompt. Then, for the updater path itself: publish the draft, install the *previous* version on a second machine, wait for the check (or Help → Check for Updates…) → confirm the update-downloaded prompt → restart.

## Auto-update behavior (what users experience)

Checks 5 s after launch and every 4 h (plus the Help menu item). Updates download silently and install on next quit; if the user is around when a build finishes downloading they get a "Restart now / Later" dialog. Update feed failures are logged, never fatal. electron-updater verifies release signatures — do not disable. Downgrades are not supported: "roll back" = ship a new patch version.

## Local verification (no certs, no display needed)

- `npm run dist:dir` — unpackaged dir build under `release/linux-unpacked` on Linux (validates asar layout, fuses, dep resolution). The CI `package` job additionally **boots** this bundle under xvfb and runs the smoke greps.
- `npm run dist` — full local build for the host platform.

## Open items

- **App icon**: `build/icon.png` (≥512×512, transparent padding per platform guides) — electron-builder generates icns/ico from it; without it installers ship the Electron default. Add before the first public release.
- Packaged-app E2E is impossible while `EnableNodeCliInspectArguments` is OFF (deliberate, D17) — the E2E suite runs the unpackaged build.
