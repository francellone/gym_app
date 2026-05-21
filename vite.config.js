import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Path aliases — actualizados 2026-05-21.
// Después de la reorg a src/features/, los aliases @pages, @hooks, @contexts y
// @services apuntaban a directorios borrados (bomba silenciosa). Quedaron
// sólo los que realmente existen + @features como atajo para src/features/.
// No es necesario migrar todos los imports existentes de golpe; reemplazar
// `../../../foo` por `@/foo` a medida que se toca cada archivo. Los imports
// relativos siguen funcionando.
export default defineConfig({
  plugins: [react()],
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
