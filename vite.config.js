import { rmSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// public/ es la raíz del documento en Plesk y contiene ficheros del servidor
// (.php-ini, .php-version): solo se limpia public/assets antes de compilar
const limpiarAssets = () => ({
  name: 'limpiar-assets',
  apply: 'build',
  buildStart() {
    rmSync('public/assets', { recursive: true, force: true })
  },
})

export default defineConfig({
  plugins: [react(), limpiarAssets()],
  // Favicon e iconos fijos: se copian tal cual a public/
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
