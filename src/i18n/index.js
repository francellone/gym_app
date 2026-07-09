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
// gradual sin romper nada. El panel del coach queda en español a propósito.

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

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
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
