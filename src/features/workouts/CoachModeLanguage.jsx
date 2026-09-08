// ============================================================
// Idioma de la pantalla de registro en MODO COACH
// ------------------------------------------------------------
// Pedido de Anto (2026-09-08): cuando registra por una alumna que habla
// inglés le muestra el celu y la alumna tiene que entender lo que ve.
//
// ⭐ REGLA DE DISEÑO: el idioma de esta pantalla NO es el idioma global de
// i18next. El panel del coach tiene (o va a tener) su propio idioma; si los
// dos compartieran instancia, poner el panel en inglés arrastraría la
// pantalla de la alumna y al revés. Por eso acá se usa una instancia
// CLONADA (comparte los diccionarios, tiene su propio idioma) provista solo
// a este subárbol vía I18nextProvider. Mismo criterio que ClientReportPage,
// que renderiza el contenido en el idioma de la alumna y deja el marco en
// español.
//
// Idioma inicial = `profiles.language` de la ALUMNA (la dueña de los datos),
// no el de la coach. El selector del header es la salida de emergencia
// (mostrarle algo en inglés a alguien con el perfil en español) y NO se
// persiste a propósito: al volver a entrar manda otra vez el idioma de la
// alumna, que es el default correcto.
//
// ⚠️ Todo helper que importe la instancia global (`import i18n from '@/i18n'`)
// se saltea este aislamiento y sigue saliendo en español. Los tres que
// pintaban en esta pantalla ya reciben `t`/`lng` por parámetro: dateLocale,
// exerciseHistoryLogic y errorHelpers. Si se agrega otro, hay que hacer lo
// mismo. En componentes, el `i18n` sale SIEMPRE de useTranslation().
// ============================================================
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import { CoachModeLanguageContext, normalizeLang } from './coachModeLanguageContext'

export default function CoachModeLanguageProvider({ children }) {
  const { id: studentId } = useParams()
  // `ctx` en null = todavía no sabemos el idioma de la alumna. No renderizamos
  // hasta saberlo: arrancar en el idioma de la coach y corregir después haría
  // un parpadeo español → inglés justo cuando le está mostrando el celu.
  // La instancia se crea UNA sola vez, ya con el idioma resuelto; los cambios
  // del selector van por changeLanguage sobre esa misma instancia (recrearla
  // remontaría el árbol y perdería lo que la coach venía cargando).
  const [ctx, setCtx] = useState(null)
  const [lang, setLang] = useState(null)

  useEffect(() => {
    if (!studentId) return undefined
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('language')
        .eq('id', studentId)
        .maybeSingle()
      if (cancelled) return
      // Ante error no bloqueamos la pantalla: español, que es el default.
      if (error) console.error('[coachModeLang] no se pudo leer el idioma:', error)
      const resolved = normalizeLang(data?.language)
      setLang(resolved)
      setCtx({ scoped: i18n.cloneInstance({ lng: resolved }), studentLang: resolved })
    })()
    return () => {
      cancelled = true
    }
  }, [studentId])

  useEffect(() => {
    if (ctx?.scoped && lang && ctx.scoped.language !== lang) ctx.scoped.changeLanguage(lang)
  }, [ctx, lang])

  if (!ctx || !lang) return null

  return (
    <CoachModeLanguageContext.Provider value={{ lang, setLang, studentLang: ctx.studentLang }}>
      <I18nextProvider i18n={ctx.scoped}>{children}</I18nextProvider>
    </CoachModeLanguageContext.Provider>
  )
}
