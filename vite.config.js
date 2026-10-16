import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: env.VITE_BASE_PATH || (command === 'build' ? '/rt/last_minute/' : '/'),
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
