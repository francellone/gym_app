/**
 * Paleta de la app en sus dos temas (docs/identidad-visual.md §9).
 *
 * Única fuente de los colores. tailwind.config.js la usa para:
 *   1. definir cada color como `rgb(var(--c-<escala>-<paso>) / <alpha>)`
 *   2. escribir las variables: claro en :root, oscuro en `.dark`
 * Así una clase como `bg-green-100` o `text-gray-900` cambia sola de tema.
 *
 * En oscuro las escalas se invierten: los pasos claros (50-200, fondos y
 * tintes) pasan a oscuros, y los pasos fuertes (600-900, texto) pasan a
 * claros. Base "Carbón": gris neutro, sin tinte marrón.
 *
 * Código fuera de Tailwind (estilos en línea, SVG, gráficos) usa
 * `rgb(var(--c-green-700))` o el ayudante `themeColor('green', 700)`.
 */

const TW_GREEN = {
  50: '#f0fdf4',
  100: '#dcfce7',
  200: '#bbf7d0',
  300: '#86efac',
  400: '#4ade80',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
  800: '#166534',
  900: '#14532d',
  950: '#052e16',
}
const TW_AMBER = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
  950: '#451a03',
}
const TW_RED = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
  900: '#7f1d1d',
  950: '#450a0a',
}

export const LIGHT = {
  white: '#ffffff',
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
    950: '#431407',
  },
  ciruela: {
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
  },
  niebla: {
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
  },
  salvia: {
    50: '#f3f7f4',
    100: '#e7f0e8',
    200: '#cfe0d3',
    300: '#a9c7b0',
    400: '#8ab396',
    500: '#6a9a76',
    600: '#5c8968',
    700: '#4f7a5b',
    800: '#3f6249',
    900: '#334f3b',
    950: '#1f3124',
  },
  green: TW_GREEN,
  amber: TW_AMBER,
  red: TW_RED,
  // Velo de ventanas emergentes: tinta en claro, casi negro en oscuro.
  velo: '#3a2e27',
}

export const DARK = {
  // "white" es la superficie de las tarjetas: en oscuro, gris carbón.
  white: '#1b1b1b',
  gray: {
    50: '#101010',
    100: '#242424',
    200: '#2e2e2e',
    300: '#3a3a3a',
    400: '#8f8f8f',
    500: '#b3b3b3',
    600: '#c4c4c4',
    700: '#d4d4d4',
    800: '#e5e5e5',
    900: '#f5f5f5',
    950: '#ffffff',
  },
  primary: {
    50: '#2a1608',
    100: '#3a1d0a',
    200: '#6b3410',
    300: '#b8591a',
    400: '#ff8a33',
    500: '#ff7a1a',
    600: '#ff6b0a',
    700: '#ff8a33',
    800: '#ff9d57',
    900: '#ffb57d',
    950: '#ffd3b0',
  },
  ciruela: {
    50: '#1f1319',
    100: '#2e1c29',
    200: '#472c3f',
    300: '#6b3f5d',
    400: '#9c6589',
    500: '#b886a8',
    600: '#c99bb9',
    700: '#dcbad0',
    800: '#e7d0df',
    900: '#f3e8ef',
    950: '#faf5f8',
  },
  niebla: {
    50: '#141c21',
    100: '#1e2a31',
    200: '#2b3d47',
    300: '#3d5869',
    400: '#5c8198',
    500: '#7b9cb0',
    600: '#a3bccb',
    700: '#c8d8e2',
    800: '#e3ecf1',
    900: '#f2f6f8',
    950: '#ffffff',
  },
  salvia: {
    50: '#141c16',
    100: '#1c2a1f',
    200: '#2c4232',
    300: '#3f6249',
    400: '#6a9a76',
    500: '#8fbf9a',
    600: '#a0c9a9',
    700: '#a9c7b0',
    800: '#cfe0d3',
    900: '#e7f0e8',
    950: '#f3f7f4',
  },
  green: {
    50: '#0b2414',
    100: '#134a2a',
    200: '#1f7a3e',
    300: '#2f9e57',
    400: '#22c55e',
    500: '#22c55e',
    600: '#22c55e',
    700: '#4ade80',
    800: '#86efac',
    900: '#bbf7d0',
    950: '#dcfce7',
  },
  amber: {
    50: '#221a05',
    100: '#5a3e06',
    200: '#8a6410',
    300: '#b8860f',
    400: '#fbbf24',
    500: '#fbbf24',
    600: '#fbbf24',
    700: '#fcd34d',
    800: '#fcd34d',
    900: '#fde68a',
    950: '#fef3c7',
  },
  red: {
    50: '#2a0c0c',
    100: '#5c1414',
    200: '#9b2c2c',
    300: '#c43c3c',
    400: '#f87171',
    500: '#f25555',
    600: '#f25555',
    700: '#fb7a7a',
    800: '#fca5a5',
    900: '#fecaca',
    950: '#fee2e2',
  },
  velo: '#000000',
}

/** '#rrggbb' → 'r g b' (formato de las variables) */
export function hexToTriplet(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

/** Aplana la paleta a { '--c-gray-900': 'r g b', ... } */
export function paletteVars(palette) {
  const out = {}
  for (const [name, value] of Object.entries(palette)) {
    if (typeof value === 'string') out[`--c-${name}`] = hexToTriplet(value)
    else
      for (const [step, hex] of Object.entries(value))
        out[`--c-${name}-${step}`] = hexToTriplet(hex)
  }
  return out
}

/** Color para estilos en línea / SVG que sigue al tema. */
export function themeColor(scale, step) {
  return step == null ? `rgb(var(--c-${scale}))` : `rgb(var(--c-${scale}-${step}))`
}
