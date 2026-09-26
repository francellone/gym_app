import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * Identidad visual "Encabezado durazno" (docs/identidad-visual.md).
 * - `gray` se redefine con neutros cálidos: así toda la app pierde el negro
 *   y los grises fríos sin tocar cada pantalla (gray-900 = tinta #3a2e27).
 * - `durazno`, `tinta`, `texto2`, `texto3`, `linea`, `fondo` son los nombres
 *   del manual; usarlos en código nuevo.
 * - `primary` sigue siendo la escala naranja de la marca.
 */
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
        gray: {
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
        },
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
      },
    },
  },
  plugins: [],
}
