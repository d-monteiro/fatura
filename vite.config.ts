import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('jszip') || id.includes('file-saver')) return 'jszip'
          if (id.includes('lucide-react')) return 'icons'
          return undefined
        },
      },
    },
  },
})
