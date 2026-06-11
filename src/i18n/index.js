import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'
import en from './locales/en.json'

// ── i18n (doc 46) ───────────────────────────────────────────────────────────
// Idioma de la UI de la vista del alumno. El idioma activo sale de
// profiles.language (lo setea el coach al crear/editar el alumno y el alumno
// puede cambiarlo en su perfil) — ver AuthContext.fetchProfile.
//
// fallbackLng 'es': todo componente que todavía no migró a t() sigue
// mostrando su texto hardcodeado en español, así la migración puede ser
// gradual sin romper nada. El panel del coach queda en español a propósito.
i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false }, // React ya escapa
  returnNull: false,
})

export default i18n
