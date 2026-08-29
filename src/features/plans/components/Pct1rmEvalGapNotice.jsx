import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
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
          const name = ex.exercise?.name || 'Ejercicio'
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
  }, [planId, studentId])

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-gray-500">
        <Loader2 size={12} className="animate-spin" />
        Revisando las evaluaciones de 1RM...
      </p>
    )
  }

  const hasPct = covered > 0 || gaps.length > 0 || missingPct.length > 0
  if (!hasPct) return null

  if (gaps.length === 0 && missingPct.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-2.5 py-2">
        <CheckCircle2 size={13} className="mt-px flex-shrink-0" />
        <span>
          Los {covered} ejercicios prescriptos por % del máximo tienen evaluación: va a ver los
          kilos calculados.
        </span>
      </p>
    )
  }

  const quien = studentName || 'Esta persona'

  return (
    <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2 space-y-1.5">
      <p className="flex items-start gap-1.5">
        <AlertTriangle size={13} className="mt-px flex-shrink-0 text-amber-600" />
        <span>
          {gaps.length > 0 && (
            <>
              <strong className="font-semibold">{quien}</strong> no tiene evaluación de 1RM de{' '}
              <strong className="font-semibold">{gaps.join(', ')}</strong>: en esos ejercicios va a
              ver el porcentaje en vez de los kilos.
            </>
          )}
          {missingPct.length > 0 && (
            <>
              {gaps.length > 0 && ' '}
              Además, falta cargar el porcentaje en{' '}
              <strong className="font-semibold">{missingPct.join(', ')}</strong>.
            </>
          )}
        </span>
      </p>
      <p className="text-amber-700 leading-snug">
        Podés asignar igual y resolverlo después: cargale una evaluación de 1RM, o ponele los kilos
        a mano en su plan una vez asignado.
      </p>
      <Link
        to={`/coach/students/${studentId}?tab=evaluaciones`}
        className="inline-block font-medium text-amber-800 underline underline-offset-2"
      >
        Ir a sus evaluaciones
      </Link>
    </div>
  )
}
