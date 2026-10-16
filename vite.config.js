import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rt/last_minute/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/backend': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
      },
    },
  },
}))
