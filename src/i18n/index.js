import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'

// ── i18n (doc 46) ───────────────────────────────────────────────────────────
// Idioma de la UI de la vista del alumno. El idioma activo sale de
// profiles.language (lo setea el coach al crear/editar el alumno y el alumno
// puede cambiarlo en su perfil) — ver AuthContext.fetchProfile.
//
// Pre-login: no hay perfil todavía, así que el default sale de
// (1) la preferencia guardada en localStorage (toggle de LoginPage), o
// (2) el idioma del navegador/dispositivo (en → inglés, resto → español).
//
// fallbackLng 'es': todo componente que todavía no migró a t() sigue
// mostrando su texto hardcodeado en español, así la migración puede ser
// gradual sin romper nada.

const PRE_LOGIN_LANG_KEY = 'gymcoach_pre_login_lang'

export function preLoginLanguage() {
  try {
    const stored = localStorage.getItem(PRE_LOGIN_LANG_KEY)
    if (stored === 'es' || stored === 'en') return stored
  } catch {
    /* localStorage puede no estar disponible (SSR/tests/privacidad) */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return nav.toLowerCase().startsWith('en') ? 'en' : 'es'
}

export function setPreLoginLanguage(lng) {
  try {
    localStorage.setItem(PRE_LOGIN_LANG_KEY, lng)
  } catch {
    /* no-op */
  }
  i18n.changeLanguage(lng)
}

// ── Panel de la coach (etapa 2 del plan i18n, 2026-09-27) ──────────────────
// Cada área del panel tiene su par de archivos en locales/coach/:
//   <área>.es.json y <área>.en.json  →  claves `coach.<área>.*`
// Separado del diccionario principal para que cada tanda tenga un diff legible
// (y Anto pueda revisar el inglés por bloque) y para que dos tandas no se
// pisen editando el mismo JSON gigante. La guardia de paridad vive en
// locales-parity.test.js.
const coachFiles = import.meta.glob('./locales/coach/*.json', { eager: true })

export function buildCoachNamespace(files, lng) {
  const out = {}
  for (const [file, mod] of Object.entries(files)) {
    const m = file.match(/\/([\w-]+)\.(es|en)\.json$/)
    if (!m || m[2] !== lng) continue
    out[m[1]] = mod.default ?? mod
  }
  return out
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: { ...es, coach: buildCoachNamespace(coachFiles, 'es') } },
    en: { translation: { ...en, coach: buildCoachNamespace(coachFiles, 'en') } },
  },
  lng: preLoginLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false }, // React ya escapa
  returnNull: false,
})

// Mantener <html lang="..."> en sincronía (accesibilidad / traductores del navegador)
if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
}

export default i18n
