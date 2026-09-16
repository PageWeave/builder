import type { PwBridge } from '../../shared/ipc'

declare global {
  interface Window {
    pw: PwBridge
  }
}

export {}
