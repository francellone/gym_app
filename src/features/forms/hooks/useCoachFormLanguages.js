/**
 * MODO BILINGÜE DE FORMULARIOS — HOOK DEL COACH
 *
 * Ver docs/plan-formularios-bilingues.md.
 *
 * Decide si el coach ve la UI de traducción en el builder:
 *   - AUTOMÁTICO: si sus alumnos activos tienen más de un `profiles.language`
 *     distinto, el modo bilingüe se enciende solo (cero configuración).
 *   - MANUAL: `profiles.forms_bilingual = true` lo fuerza aunque todavía no
 *     tenga alumnos en otro idioma (para preparar traducciones antes).
 *
 * Los coaches monolingües sin override no ven ningún cambio en su UI.
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'

export function useCoachFormLanguages() {
  const { profile, refreshProfile } = useAuth()
  const [studentLanguages, setStudentLanguages] = useState(['es'])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!profile?.id || profile.role !== 'coach') {
        if (!cancelled) setLoading(false)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('language')
        .eq('coach_id', profile.id)
        .eq('active', true)
      if (cancelled) return
      const langs = [...new Set((data || []).map((s) => s.language || 'es'))]
      setStudentLanguages(langs.length > 0 ? langs : ['es'])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.role])

  const autoBilingual = studentLanguages.length > 1
  const override = profile?.forms_bilingual === true
  const bilingual = autoBilingual || override

  /** Prende/apaga el override manual (apagar = volver a automático).
   *  Sin useCallback a propósito: el React Compiler del proyecto memoiza solo. */
  async function setOverride(value) {
    if (!profile?.id) return
    await supabase
      .from('profiles')
      .update({ forms_bilingual: value ? true : null })
      .eq('id', profile.id)
    await refreshProfile?.()
  }

  return { bilingual, autoBilingual, override, studentLanguages, loading, setOverride }
}
