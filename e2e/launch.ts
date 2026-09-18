import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface E2EApp {
  app: ElectronApplication
  page: Page
}

/** Launches the built app with the E2E stubs enabled (PW_E2E=1). */
export async function launchApp(): Promise<E2EApp> {
  const app = await electron.launch({
    args: ['out/main/index.js', '--no-sandbox'],
    env: { ...process.env, PW_E2E: '1' },
    cwd: process.cwd(),
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

export async function closeApp(e2e: E2EApp): Promise<void> {
  await e2e.app.close()
}
