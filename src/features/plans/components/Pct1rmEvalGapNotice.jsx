import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Trans, useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { fetchOneRmMap, resolvePrescribedWeight } from '@/features/evaluations/oneRm'

// ============================================================
// Aviso con acción: ¿a quién le falta la evaluación de 1RM?
// ------------------------------------------------------------
// Un plan prescripto por % del máximo depende del 1RM de cada persona.
// Si no lo tiene, no ve kilos: ve el porcentaje. Eso no es un error,
// pero el coach tiene que enterarse ANTES de asignar, no después de que
// la alumna abra el plan y no entienda qué peso poner.
//
// Se muestra al elegir la persona en el modal de asignar. Silencioso
// cuando el plan no usa %RM o cuando está todo cubierto.
// ============================================================
export default function Pct1rmEvalGapNotice({ planId, studentId, studentName = '' }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [gaps, setGaps] = useState([])
  const [covered, setCovered] = useState(0)
  const [missingPct, setMissingPct] = useState([])

  useEffect(() => {
    let cancelled = false
    if (!planId || !studentId) {
      setGaps([])
      setCovered(0)
      setMissingPct([])
      return
    }
    setLoading(true)
    ;(async () => {
      try {
        const [{ data: exercises }, { data: blocks }, oneRmMap] = await Promise.all([
          supabase
            .from('plan_exercises')
            .select(
              'id, exercise_id, block_id, weight_mode, pct_1rm, rm_reference_exercise_id, exercise:exercises!exercise_id(id, name)'
            )
            .eq('plan_id', planId)
            .eq('weight_mode', 'pct_1rm'),
          supabase.from('plan_blocks').select('id, default_pct_1rm').eq('plan_id', planId),
          fetchOneRmMap(supabase, studentId),
        ])
        if (cancelled) return

        const blockById = new Map((blocks || []).map((b) => [b.id, b]))
        const today = format(new Date(), 'yyyy-MM-dd')
        const faltan = []
        const sinPct = []
        let ok = 0

        for (const ex of exercises || []) {
          const r = resolvePrescribedWeight({
            planExercise: ex,
            block: ex.block_id ? blockById.get(ex.block_id) : null,
            oneRmMap,
            weightMode: 'pct_1rm',
            today,
          })
          const name = ex.exercise?.name || t('coach.planEditor.pct1rmGap.exerciseFallback')
          if (r.status === 'derived') ok += 1
          else if (r.status === 'missing_pct') sinPct.push(name)
          else faltan.push(name)
        }

        // Un mismo ejercicio puede aparecer en varios días del plan.
        setGaps([...new Set(faltan)])
        setMissingPct([...new Set(sinPct)])
        setCovered(ok)
      } catch (err) {
        console.error('No se pudo revisar las evaluaciones de 1RM:', err)
        if (!cancelled) {
          setGaps([])
          setMissingPct([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [planId, studentId, t])

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-gray-500">
        <Loader2 size={12} className="animate-spin" />
        {t('coach.planEditor.pct1rmGap.checking')}
      </p>
    )
  }

  const hasPct = covered > 0 || gaps.length > 0 || missingPct.length > 0
  if (!hasPct) return null

  if (gaps.length === 0 && missingPct.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-2.5 py-2">
        <CheckCircle2 size={13} className="mt-px flex-shrink-0" />
        <span>{t('coach.planEditor.pct1rmGap.allCovered', { count: covered })}</span>
      </p>
    )
  }

  const quien = studentName || t('coach.planEditor.pct1rmGap.thisPerson')
  const bold = { b: <strong className="font-semibold" /> }

  return (
    <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2 space-y-1.5">
      <p className="flex items-start gap-1.5">
        <AlertTriangle size={13} className="mt-px flex-shrink-0 text-amber-600" />
        <span>
          {gaps.length > 0 && (
            <>
              <Trans
                i18nKey="coach.planEditor.pct1rmGap.missingEval"
                values={{ name: quien, exercises: gaps.join(', ') }}
                components={bold}
              />
            </>
          )}
          {missingPct.length > 0 && (
            <>
              {gaps.length > 0 && ' '}
              <Trans
                i18nKey="coach.planEditor.pct1rmGap.missingPct"
                values={{ exercises: missingPct.join(', ') }}
                components={bold}
              />
            </>
          )}
        </span>
      </p>
      <p className="text-amber-700 leading-snug">{t('coach.planEditor.pct1rmGap.help')}</p>
      <Link
        to={`/coach/students/${studentId}?tab=evaluaciones`}
        className="inline-block font-medium text-amber-800 underline underline-offset-2"
      >
        {t('coach.planEditor.pct1rmGap.goToEvals')}
      </Link>
    </div>
  )
}
