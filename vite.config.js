import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://kf.kobotoolbox.org',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})