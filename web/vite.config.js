import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the interface runs on 5173 and the API on 8000, and the proxy
// below joins them so that the code calls /api/... in both settings. Deployed,
// the Worker serves this build and the API from one origin, so no proxy is
// involved and the same relative paths work unchanged.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
