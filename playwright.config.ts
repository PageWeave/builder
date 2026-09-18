import { defineConfig } from '@playwright/test'

/**
 * E2E for the packaged-by-electron-vite app shell (`out/main/index.js`) via
 * the `_electron` API. No browser downloads needed — the app's own Electron
 * binary is the browser. Launch happens under xvfb in CI (`xvfb-run -a npx
 * playwright test`) and locally on any desktop.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
})
