/** Human-safe error text — never raw IPC/stack output. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
