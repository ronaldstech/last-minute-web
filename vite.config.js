import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    // Vercel serves the app from the domain root. Set VITE_BASE_PATH=/rt/last_minute/
    // when building for a Hostinger subdirectory instead.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    server: {
      proxy: {
        '/backend': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
      },
    },
  }
})
