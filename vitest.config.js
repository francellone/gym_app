import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Configuración de tests — separada de vite.config.js para no acoplar build y test.
// Aliases idénticos a vite.config.js (cualquier cambio acá replicarlo allá).
//
// Convenciones:
//   - Tests viven al lado del código que prueban: src/foo/bar.test.js o bar.test.jsx
//   - `globals: true` evita tener que importar describe/it/expect/vi en cada archivo.
//   - jsdom como environment para que renderHook / render de RTL funcionen.
//   - setupFiles corre antes de cada test file: registra matchers de jest-dom
//     y stubea APIs del browser que faltan en jsdom (matchMedia, IntersectionObserver).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', 'dist/**', 'supabase/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/main.jsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
})
