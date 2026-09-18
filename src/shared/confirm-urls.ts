/**
 * Pure validator for URLs the renderer may ask to open in the system
 * browser (chat markdown links, confirmation workflow URLs). The renderer is
 * untrusted: only https on PageWeave-controlled hosts passes.
 */
export function isAllowedExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    if (url.username !== '' || url.password !== '') return false
    const host = url.hostname.toLowerCase()
    return host === 'pageweave.dev' || host.endsWith('.pageweave.site') || host.endsWith('.pageweave.dev')
  } catch {
    return false
  }
}
