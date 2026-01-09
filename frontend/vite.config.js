import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/import-slidepack': 'http://localhost:8000',
      '/upload-batch': 'http://localhost:8000',
      '/generate': 'http://localhost:8000',
      '/sync': 'http://localhost:8000',
      '/courses': 'http://localhost:8000',
      '/slidepacks': 'http://localhost:8000',
      '/storage': 'http://localhost:8000',
    }
  }
})
