import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  base: '/random-welcome/',
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: true,
    port: 5178,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../resources/web',
    emptyOutDir: true
  }
})
