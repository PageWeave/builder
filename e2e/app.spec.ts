import { expect, test, type Page } from '@playwright/test'
import { closeApp, launchApp } from './launch'

/**
 * CI-safe end-to-end smoke of the product loop with PW_E2E=1 stubs
 * (src/main/e2e.ts): canned auth/model/sites/conversations and a canned
 * prompt event sequence. The real engine process boots and answers pings —
 * only display/keyring/network-dependent responses are canned.
 */

/** Each test gets a fresh app instance (userData is E2E-isolated). */
async function signIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await expect(page.getByText('Signed in')).toBeVisible()
}

/** Connects the canned E2E model through the debug console form. */
async function connectModel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Connect model' }).click()
  await expect(page.getByText('Cmd/Ctrl+Shift+D to toggle')).toBeVisible()
  await page.locator('select').selectOption('custom')
  await page.getByPlaceholder('https://api.example.com/v1').fill('https://e2e.invalid/v1')
  await page.getByPlaceholder(/model id/).fill('e2e-model')
  await page.getByRole('button', { name: 'Connect model' }).last().click()
  // The toolbar badge renders the connected provider as its own text node.
  await expect(page.getByText('custom', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
}

test.describe('first-run flow (stubs)', () => {
  let launched: Awaited<ReturnType<typeof launchApp>>

  test.beforeEach(async () => {
    launched = await launchApp()
  })

  test.afterEach(async () => {
    await closeApp(launched)
  })

  test('first-run gates render and sign-in advances the stepper', async () => {
    const { page } = launched
    await expect(page.getByText('Getting started')).toBeVisible()
    await expect(page.getByText('Sign in to PageWeave')).toBeVisible()

    await page.getByRole('button', { name: 'Sign in' }).first().click()
    await expect(page.getByText('Signed in')).toBeVisible()
  })

  test('connect model via the debug console clears the model gate', async () => {
    const { page } = launched
    await signIn(page)
    await connectModel(page)

    // Gates satisfied for auth+model — the card is gone; the chat hints at sites.
    await expect(page.getByPlaceholder(/Pick a site in the sidebar/)).toBeVisible()
  })

  test('site picker shows the canned site and selecting it activates chat', async () => {
    const { page } = launched
    await signIn(page)
    await connectModel(page)
    await expect(page.getByText('Demo Site')).toBeVisible()

    await page.getByRole('button', { name: 'Demo Site' }).click()
    await expect(page.getByPlaceholder('Ask the agent to build something…')).toBeEnabled()
    await expect(page.getByText('Create the marketing site')).toBeVisible()
    await expect(page.getByText('Demo Site').nth(1)).toBeVisible()
  })

  test('prompt streams canned events and surfaces the confirmation card', async () => {
    const { page } = launched
    await signIn(page)
    await connectModel(page)
    await page.getByRole('button', { name: 'Demo Site' }).click()

    const composer = page.getByPlaceholder('Ask the agent to build something…')
    await composer.fill('Make the hero bigger')
    await composer.press('Enter')

    await expect(page.getByText("Here's the hero update —")).toBeVisible()
    await expect(page.getByText('mcp__pageweave__update_page').first()).toBeVisible()
    const confirm = page.getByRole('button', { name: /Review & confirm/ })
    await expect(confirm).toBeVisible()
    await confirm.click()
    // openExternal failure (no browser in CI) is swallowed; the click itself
    // exercised the validated IPC path without crashing.
    await expect(page.getByText('This change needs your confirmation.')).toBeVisible()
  })

  test('debug console toggles via the menu push channel', async () => {
    const { app, page } = launched
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('debug:toggle')
    })
    await expect(page.getByText('Cmd/Ctrl+Shift+D to toggle')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Debug console', { exact: true })).toBeHidden()
  })
})
