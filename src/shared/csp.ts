/**
 * Content-Security-Policy strings for the app renderer.
 *
 * index.html contains a `__CSP__` placeholder; electron.vite.config.ts swaps
 * in the right policy per mode (strict for prod builds, HMR-friendly for the
 * dev server). Kept in shared/ so tests can assert the production policy.
 *
 * Note: `style-src 'unsafe-inline'` stays in production — Tailwind/daisyUI
 * styles are build artifacts, but some component libraries inject style
 * attributes; inline styles are not a script-execution vector. `script-src`
 * is the hard line and stays `'self'` only.
 */
export const CSP_PROD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"

export const CSP_DEV = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:`
