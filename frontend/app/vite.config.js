import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), glsl()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'shaders': resolve(__dirname, 'src/ribbons/shaders'),
      'events': 'events'
    }
  },
  optimizeDeps: {
    include: ['events']
  }
})
