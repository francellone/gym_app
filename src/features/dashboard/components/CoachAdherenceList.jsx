import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ChevronRight, Users } from 'lucide-react'
import { computeDayTallies } from '@/features/students/dayTalliesLogic'
import DayTalliesBadge from '@/features/students/components/DayTalliesBadge'

// ============================================================
// CoachAdherenceList
// ------------------------------------------------------------
// Q2 — Bloque de "Adherencia por alumno" para el dashboard del coach.
// Una fila por alumno activo con plan vigente de training: nombre +
// plan + tildes (Día A ✓✓◐ Día B ✓✓). Click → /coach/students/:id.
//
// Ventana temporal: desde inicio del plan vigente (decisión Franco
// 2026-05-23 noche — coherente con StudentDashboard y la card en
// StudentDetailPage).
//
// Optimización: en vez de 2 queries por alumno, agrupamos en 2
// queries grandes (plan_exercises + workout_logs) filtrando por
// plan_id IN (...). Después agrupamos en cliente.
//
// Self-contained. Sin props requeridas (el coachId viene vía RLS
// + AuthContext en el fetch). Si no hay alumnos con plan activo,
// muestra placeholder.
//
// Filtros (Fase C.1 — Doc 19):
//   - filterStudentId   uuid | null   solo ese alumno
//   - filterPlanId      uuid | null   solo esa plan_assignment (UUID, no plan_id)
//   - filterPeriodRange { start, end } YMD para acotar workout_logs
// ============================================================

export default function CoachAdherenceList({
  filterStudentId = null,
  filterPlanId = null,
  filterPeriodRange = null,
  className = '',
}) {
  const [loading, setLoading] = useState(true)
  // rows: [{ assignment, student, talliesBySection }]
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // 1) Asignaciones activas de training. RLS limita al coach autenticado.
        let assignmentsQuery = supabase
          .from('plan_assignments')
          .select(
            'id, plan_id, student_id, start_date, plan_type, status, plan:plans!plan_id(title, plan_type), student:profiles!student_id(id, name, active)'
          )
          .eq('status', 'active')
          .eq('plan_type', 'training')

        if (filterStudentId) assignmentsQuery = assignmentsQuery.eq('student_id', filterStudentId)
        if (filterPlanId) assignmentsQuery = assignmentsQuery.eq('id', filterPlanId)

        const { data: assignments, error: errA } = await assignmentsQuery

        if (errA) throw errA
        if (cancelled) return

        // Filtramos: alumno activo, alumno con nombre, plan presente.
        const valid = (assignments || []).filter(
          (a) => a.student?.active && a.student?.name && a.plan_id
        )

        if (valid.length === 0) {
          setRows([])
          setLoading(false)
          return
        }

        // 2) Fetch agregado: plan_exercises + workout_logs de TODOS los
        // planes/alumnos involucrados en una sola consulta cada uno.
        const planIds = Array.from(new Set(valid.map((a) => a.plan_id)))
        const studentIds = Array.from(new Set(valid.map((a) => a.student_id)))

        // v29 (plan 29): además de plan_exercises + workout_logs, traemos
        // plan_blocks (para resolver block_type) y workout_block_logs (para
        // que los bloques aerobic/circuit cuenten al armar los tallies).
        const [exercisesRes, blocksRes, logsRes, blockLogsRes] = await Promise.all([
          supabase
            .from('plan_exercises')
            .select('id, section, plan_id, block_id')
            .in('plan_id', planIds),
          supabase
            .from('plan_blocks')
            .select('id, plan_id, section_id, block_type')
            .in('plan_id', planIds),
          supabase
            .from('workout_logs')
            .select('logged_date, plan_exercise_id, completed, plan_id, student_id')
            .in('plan_id', planIds)
            .in('student_id', studentIds),
          supabase
            .from('workout_block_logs')
            .select('logged_date, plan_block_id, completed, plan_id, student_id')
            .in('plan_id', planIds)
            .in('student_id', studentIds),
        ])

        if (cancelled) return

        const allExercises = exercisesRes.data || []
        const allBlocks = blocksRes.data || []
        const allLogs = logsRes.data || []
        const allBlockLogs = blockLogsRes.data || []

        // 3) Indexar por plan_id y (plan_id, student_id) para no recorrer
        // todo el array por cada asignación.
        const exercisesByPlan = new Map()
        for (const pe of allExercises) {
          if (!exercisesByPlan.has(pe.plan_id)) exercisesByPlan.set(pe.plan_id, [])
          exercisesByPlan.get(pe.plan_id).push(pe)
        }

        const blocksByPlan = new Map()
        for (const pb of allBlocks) {
          if (!blocksByPlan.has(pb.plan_id)) blocksByPlan.set(pb.plan_id, [])
          blocksByPlan.get(pb.plan_id).push(pb)
        }

        const logsByKey = new Map()
        for (const l of allLogs) {
          const key = `${l.plan_id}__${l.student_id}`
          if (!logsByKey.has(key)) logsByKey.set(key, [])
          logsByKey.get(key).push(l)
        }

        const blockLogsByKey = new Map()
        for (const bl of allBlockLogs) {
          const key = `${bl.plan_id}__${bl.student_id}`
          if (!blockLogsByKey.has(key)) blockLogsByKey.set(key, [])
          blockLogsByKey.get(key).push(bl)
        }

        // 4) Construir filas. Filtrar logs anteriores a start_date del
        // plan para evitar "fugas" de planes históricos con mismo plan_id
        // reasignado en distintos rangos. Si hay filterPeriodRange,
        // se acota adicionalmente a esa ventana.
        const built = valid.map((a) => {
          const planExercises = exercisesByPlan.get(a.plan_id) || []
          const planBlocks = blocksByPlan.get(a.plan_id) || []
          const allStudentLogs = logsByKey.get(`${a.plan_id}__${a.student_id}`) || []
          const allStudentBlockLogs = blockLogsByKey.get(`${a.plan_id}__${a.student_id}`) || []
          const planStart = a.start_date || '2000-01-01'
          const windowStart =
            filterPeriodRange?.start && filterPeriodRange.start > planStart
              ? filterPeriodRange.start
              : planStart
          const windowEnd = filterPeriodRange?.end || '9999-12-31'
          const logsInWindow = allStudentLogs.filter((l) => {
            const d = String(l.logged_date || '').slice(0, 10)
            return d >= windowStart && d <= windowEnd
          })
          const blockLogsInWindow = allStudentBlockLogs.filter((bl) => {
            const d = String(bl.logged_date || '').slice(0, 10)
            return d >= windowStart && d <= windowEnd
          })
          const tallies = computeDayTallies({
            logs: logsInWindow,
            planExercises,
            blockLogs: blockLogsInWindow,
            planBlocks,
          })
          const hasAnyTally = Object.values(tallies).some(
            (t) => t && (t.entero > 0 || t.parcial > 0)
          )
          return {
            assignment: a,
            student: a.student,
            tallies,
            hasAnyTally,
          }
        })

        // Orden: primero los que tienen tallies (más útil), después los
        // que aún no entrenaron. Dentro de cada grupo, alfabético.
        built.sort((a, b) => {
          if (a.hasAnyTally !== b.hasAnyTally) return a.hasAnyTally ? -1 : 1
          return (a.student?.name || '').localeCompare(b.student?.name || '', 'es')
        })

        setRows(built)
      } catch (err) {
        console.error('[CoachAdherenceList] load', err)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [filterStudentId, filterPlanId, filterPeriodRange?.start, filterPeriodRange?.end])

  if (loading) {
    return (
      <div className={`card ${className}`}>
        <p className="text-xs text-gray-400 italic">Cargando adherencia…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={`card text-center py-6 ${className}`}>
        <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          Todavía no hay alumnos con plan de entrenamiento activo
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {rows.map(({ assignment, student, tallies, hasAnyTally }) => (
        <Link
          key={assignment.id}
          to={`/coach/students/${student.id}`}
          className="card flex items-center gap-3 hover:shadow-md transition-shadow"
        >
          <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 text-sm font-semibold">{initials(student.name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{student.name}</p>
              <span className="text-[11px] text-gray-400 truncate ml-2 max-w-[40%]">
                {assignment.plan?.title || ''}
              </span>
            </div>
            <div className="mt-1">
              {hasAnyTally ? (
                <DayTalliesBadge tallies={tallies} variant="compact" />
              ) : (
                <p className="text-xs text-gray-400 italic">Sin entrenos registrados</p>
              )}
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
        </Link>
      ))}
    </div>
  )
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
