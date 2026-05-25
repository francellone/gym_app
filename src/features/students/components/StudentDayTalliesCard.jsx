import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { computeDayTallies } from '../dayTalliesLogic'
import DayTalliesBadge from './DayTalliesBadge'

// ============================================================
// StudentDayTalliesCard
// ------------------------------------------------------------
// Q2 — Card chica que muestra cuántas veces el alumno hizo cada día
// del plan activo (Día A ✓✓◐, etc). Pensado para el header del
// coach en StudentDetailPage (debajo del perfil, arriba de los tabs),
// pero es reutilizable.
//
// Self-contained: hace su propio fetch de plan_exercises + workout_logs
// para no inflar al padre. Si no hay assignment activo de training,
// no se renderiza nada.
//
// Props:
//   studentId        UUID del alumno
//   activeAssignment plan_assignment object con { id, plan_id, start_date, plan?: { title } }
//   variant          'default' | 'compact'   pasa-through al badge
//   title            string  título de la card (default "Cuántas veces hiciste cada día")
// ============================================================

export default function StudentDayTalliesCard({
  studentId,
  activeAssignment,
  variant = 'default',
  title = 'Cuántas veces hiciste cada día',
}) {
  const [tallies, setTallies] = useState({})
  const [loading, setLoading] = useState(false)

  const planId = activeAssignment?.plan_id || null
  const startDate = activeAssignment?.start_date || null

  useEffect(() => {
    if (!studentId || !planId) {
      setTallies({})
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // v29 (plan 29): además de PE + workout_logs, traemos plan_blocks
        // y workout_block_logs para que los bloques aerobic/circuit cuenten
        // como ítems del día (antes quedaban siempre como "parcial").
        const [exercisesRes, blocksRes, logsRes, blockLogsRes] = await Promise.all([
          supabase.from('plan_exercises').select('id, section, block_id').eq('plan_id', planId),
          supabase.from('plan_blocks').select('id, section, block_type').eq('plan_id', planId),
          supabase
            .from('workout_logs')
            .select('logged_date, plan_exercise_id, completed')
            .eq('student_id', studentId)
            .eq('plan_id', planId)
            .gte('logged_date', startDate || '2000-01-01'),
          supabase
            .from('workout_block_logs')
            .select('logged_date, plan_block_id, completed')
            .eq('student_id', studentId)
            .eq('plan_id', planId)
            .gte('logged_date', startDate || '2000-01-01'),
        ])
        if (cancelled) return
        const t = computeDayTallies({
          logs: logsRes.data || [],
          planExercises: exercisesRes.data || [],
          blockLogs: blockLogsRes.data || [],
          planBlocks: blocksRes.data || [],
        })
        setTallies(t)
      } catch (err) {
        console.error('[StudentDayTalliesCard] fetch', err)
        if (!cancelled) setTallies({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [studentId, planId, startDate])

  if (!activeAssignment) return null

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {activeAssignment.plan?.title && (
          <span className="text-[11px] text-gray-400 truncate ml-2 max-w-[60%]">
            {activeAssignment.plan.title}
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-gray-400 italic">Cargando…</p>
      ) : (
        <DayTalliesBadge tallies={tallies} variant={variant} showLegend />
      )}
    </div>
  )
}
