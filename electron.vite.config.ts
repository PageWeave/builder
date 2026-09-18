import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { CSP_DEV, CSP_PROD } from './src/shared/csp'

/**
 * index.html carries a `__CSP__` placeholder so one authored file serves both
 * modes: strict policy in production builds, HMR-friendly policy in dev
 * (inline preamble for React refresh, ws:// for Vite HMR).
 */
function csp(): Plugin {
  return {
    name: 'pw-csp',
    transformIndexHtml: {
      handler(html, ctx) {
        return html.replace('__CSP__', ctx.server ? CSP_DEV : CSP_PROD)
      },
    },
  }
}

export default defineConfig({
  main: {
    build: {
      // DECISIONS D12/D14: bundle runtime deps (openid-client, pi packages,
      // pi-mcp-adapter) into the main/engine chunks. pi-mcp-adapter ships raw
      // TypeScript as its entry — Node cannot load it externalized, and a
      // self-contained chunk needs no node_modules shipping at M5.
      externalizeDeps: false,
      rollupOptions: {
        input: { index: 'src/main/index.ts' },
        output: {
          // Single file per entry: code-split chunk ordering broke the
          // __filename shim with a TDZ error at engine boot.
          inlineDynamicImports: true,
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: 'src/preload/index.ts' },
        // Sandboxed preloads only load CommonJS — force .cjs regardless of
        // the project-level "type": "module" (see DECISIONS D12).
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), csp()],
  },
})
