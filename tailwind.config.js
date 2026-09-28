import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * Identidad visual "Encabezado durazno" (docs/identidad-visual.md).
 * - `gray` se redefine con neutros cálidos: así toda la app pierde el negro
 *   y los grises fríos sin tocar cada pantalla (gray-900 = tinta #3a2e27).
 * - `durazno`, `tinta`, `texto2`, `texto3`, `linea`, `fondo` son los nombres
 *   del manual; usarlos en código nuevo.
 * - `primary` sigue siendo la escala naranja de la marca.
 */
import { LIGHT, DARK, paletteVars } from './src/theme/palette.js'

/**
 * Modo oscuro (2026-09-28, manual §9): cada color es una variable CSS con
 * sus valores claro (:root) y oscuro (.dark), definidos en src/theme/palette.js.
 * Las clases de siempre (bg-white, text-gray-900, bg-green-100…) cambian
 * solas de tema. `.tema-claro` fuerza el claro dentro de un bloque (informes).
 */
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`
const scale = (name) =>
  Object.fromEntries(Object.keys(LIGHT[name]).map((step) => [step, ref(`${name}-${step}`)]))

const GRIS_CALIDO = scale('gray')
const CIRUELA = scale('ciruela')
const NIEBLA = scale('niebla')
const PRIMARY = scale('primary')
const GREEN = scale('green')
const AMBER = scale('amber')
const RED = scale('red')

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: PRIMARY,
        orange: PRIMARY,
        white: ref('white'),
        blanco: '#ffffff',
        velo: ref('velo'),
        green: GREEN,
        amber: AMBER,
        red: RED,
        gray: GRIS_CALIDO,
        // Colores de categoría (manual §2, "Categorías"): distinguen lo que
        // la coach mira junto sin romper la paleta. Se redefinen las escalas
        // de Tailwind para que el código existente las tome sin tocarlo.
        //   ciruela = evaluaciones (reemplaza purple/violet/indigo)
        //   niebla  = información y aeróbico (reemplaza blue/sky)
        purple: CIRUELA,
        violet: CIRUELA,
        indigo: CIRUELA,
        ciruela: CIRUELA,
        blue: NIEBLA,
        sky: NIEBLA,
        niebla: NIEBLA,
        // Salvia (2026-09-27): parte "Bienestar". Más gris que el verde de
        // estado para que no se confundan.
        salvia: scale('salvia'),
        slate: GRIS_CALIDO,
        // Escalas saturadas sueltas (2026-09-27): se llevan a la familia del
        // manual que ya significa lo mismo, así nada queda fuera de paleta.
        //   emerald, lime → verde de estado "bien"
        //   yellow        → ámbar de "atención"
        //   rose          → rojo de "problema"
        //   pink, fuchsia → ciruela;  teal, cyan → niebla
        emerald: GREEN,
        lime: GREEN,
        yellow: AMBER,
        rose: RED,
        pink: CIRUELA,
        fuchsia: CIRUELA,
        teal: NIEBLA,
        cyan: NIEBLA,
        durazno: { 50: PRIMARY[50], 100: PRIMARY[100], 200: PRIMARY[200], 300: PRIMARY[300] },
        tinta: GRIS_CALIDO[900],
        texto2: GRIS_CALIDO[500],
        texto3: GRIS_CALIDO[400],
        linea: GRIS_CALIDO[200],
        fondo: GRIS_CALIDO[50],
      },
      borderRadius: {
        tarjeta: '22px',
        recuadro: '16px',
        boton: '18px',
        encabezado: '28px',
      },
      boxShadow: {
        flotante: '0 8px 24px rgba(160, 90, 40, 0.12)',
        // Sombras de Tailwind en tono cálido y más suaves
        sm: '0 1px 2px rgba(120, 60, 20, 0.05)',
        DEFAULT: '0 1px 3px rgba(120, 60, 20, 0.07)',
        md: '0 4px 12px rgba(160, 90, 40, 0.08)',
        lg: '0 8px 24px rgba(160, 90, 40, 0.12)',
        xl: '0 12px 32px rgba(160, 90, 40, 0.14)',
        '2xl': '0 20px 48px rgba(120, 60, 20, 0.18)',
      },
    },
  },
  plugins: [
    ({ addBase }) => {
      const light = paletteVars(LIGHT)
      addBase({
        ':root': { ...light, colorScheme: 'light' },
        '.dark': { ...paletteVars(DARK), colorScheme: 'dark' },
        '.dark .tema-claro, .tema-claro': { ...light, colorScheme: 'light' },
      })
    },
  ],
}
