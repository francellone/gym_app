import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * Identidad visual "Encabezado durazno" (docs/identidad-visual.md).
 * - `gray` se redefine con neutros cálidos: así toda la app pierde el negro
 *   y los grises fríos sin tocar cada pantalla (gray-900 = tinta #3a2e27).
 * - `durazno`, `tinta`, `texto2`, `texto3`, `linea`, `fondo` son los nombres
 *   del manual; usarlos en código nuevo.
 * - `primary` sigue siendo la escala naranja de la marca.
 */
const GRIS_CALIDO = {
  50: '#fbf8f5',
  100: '#f5f0eb',
  200: '#f0e7df',
  300: '#e3d8cf',
  400: '#a3958b',
  500: '#76675d',
  600: '#6b5d54',
  700: '#5a4b42',
  800: '#46382f',
  900: '#3a2e27',
  950: '#2b211c',
}

const CIRUELA = {
  50: '#faf5f8',
  100: '#f3e8ef',
  200: '#e7d0df',
  300: '#d3adc6',
  400: '#b886a8',
  500: '#9c6589',
  600: '#834f72',
  700: '#6b3f5d',
  800: '#57344c',
  900: '#472c3f',
  950: '#2e1c29',
}

const NIEBLA = {
  50: '#f2f6f8',
  100: '#e3ecf1',
  200: '#c8d8e2',
  300: '#a3bccb',
  400: '#7b9cb0',
  500: '#5c8198',
  600: '#4a6b80',
  700: '#3d5869',
  800: '#334955',
  900: '#2b3d47',
  950: '#1e2a31',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
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
        slate: GRIS_CALIDO,
        durazno: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
        },
        tinta: '#3a2e27',
        texto2: '#76675d',
        texto3: '#a3958b',
        linea: '#f0e7df',
        fondo: '#fbf8f5',
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
  plugins: [],
}
