import { defineConfig } from 'vite'
export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  css: {
    postcss: {
      plugins: []
    }
  },
  server: {
    port: 50591,
    strictPort: false,
    open: false
  },
  preview: {
    port: 50591,
    strictPort: false
  }
})