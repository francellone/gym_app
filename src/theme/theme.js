/**
 * Tema claro / oscuro (manual §9).
 *
 * Preferencia guardada en este dispositivo: 'system' (sigue al celular),
 * 'light' u 'dark'. El tema se aplica con la clase `dark` en <html>; los
 * colores cambian solos porque son variables (src/theme/palette.js).
 * index.html repite la lógica mínima antes de pintar para que no haya un
 * destello claro al abrir la app de noche.
 */
export const THEME_KEY = 'gymcoach.theme'
export const THEME_MODES = ['system', 'light', 'dark']

// Color de la barra del navegador / estado del celular en cada tema
const BAR_COLOR = { light: '#ffedd5', dark: '#1b1b1b' }

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (THEME_MODES.includes(v)) return v
  } catch {
    /* localStorage bloqueado: seguimos al sistema */
  }
  return 'system'
}

function systemIsDark() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
}

/** 'light' | 'dark' efectivo para un modo guardado */
export function resolveTheme(mode) {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemIsDark() ? 'dark' : 'light'
}

export function applyTheme(mode = getStoredTheme()) {
  const theme = resolveTheme(mode)
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BAR_COLOR[theme])
  return theme
}

export function setStoredTheme(mode) {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* no-op */
  }
  applyTheme(mode)
  window.dispatchEvent(new CustomEvent('gymcoach:theme', { detail: mode }))
}

/** Llamar una vez al arrancar: aplica el tema y sigue los cambios del celular. */
export function initTheme() {
  applyTheme()
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  }
  mq?.addEventListener?.('change', onChange)
}
