// Contexto del idioma de la pantalla de registro en modo coach.
// Vive aparte del provider para no romper fast-refresh (un archivo .jsx que
// exporta componentes no debería exportar además hooks/constantes).
// La explicación del diseño está en CoachModeLanguage.jsx.
import { createContext, useContext } from 'react'

export const CoachModeLanguageContext = createContext(null)

/**
 * Devuelve `{ lang, setLang, studentLang }` dentro del modo coach y `null` en
 * la ruta de la alumna (que no monta el provider). Los componentes que
 * comparten las dos rutas usan ese null para no pintar el selector.
 */
export function useCoachModeLanguage() {
  return useContext(CoachModeLanguageContext)
}

/** 'en' o cualquier otra cosa → 'es' (default histórico de la app). */
export function normalizeLang(value) {
  return value === 'en' ? 'en' : 'es'
}
