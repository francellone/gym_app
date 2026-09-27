import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { computeDayTallies } from '@/features/students/dayTalliesLogic'
import DayTalliesBadge from '@/features/students/components/DayTalliesBadge'
import AvatarImage from '@/features/avatars/AvatarImage'

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
//
// Agrupado (2026-09-26, "con mucha gente queda muy larga"):
//   - Atrasadas: la última semana CERRADA hicieron menos días de los
//     que pide el plan (mismo criterio que la alerta lowAdherence, que
//     llega por `behind`). Arriba, con "1 de 3 la semana pasada".
//   - Al día: plegado en una línea que se despliega.
//   - Sin entrenamientos registrados: plegado igual.
//   Con una persona filtrada se muestra la fila sola, sin grupos.
//
// Los logs se traen PAGINADOS (fetchAllRows): con 28 planes activos ya
// había 1466 workout_logs y PostgREST corta en 1000 sin avisar.
// ============================================================

export default function CoachAdherenceList({
  filterStudentId = null,
  filterPlanId = null,
  filterPeriodRange = null,
  behind = null, // [{ studentId, completed, target, pct }] (alerts.lowAdherence)
  className = '',
}) {
  const [openGroups, setOpenGroups] = useState({})
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
            'id, plan_id, student_id, start_date, plan_type, status, plan:plans!plan_id(title, plan_type), student:profiles!student_id(id, name, avatar_url, active)'
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
        const [allExercises, allBlocks, allLogs, allBlockLogs] = await Promise.all([
          fetchAllRows((from, to) =>
            supabase
              .from('plan_exercises')
              .select('id, section, plan_id, block_id')
              .in('plan_id', planIds)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('plan_blocks')
              .select('id, plan_id, section, block_type')
              .in('plan_id', planIds)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('workout_logs')
              .select('id, logged_date, plan_exercise_id, completed, plan_id, student_id')
              .in('plan_id', planIds)
              .in('student_id', studentIds)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('workout_block_logs')
              .select('id, logged_date, plan_block_id, completed, plan_id, student_id')
              .in('plan_id', planIds)
              .in('student_id', studentIds)
              .order('id', { ascending: true })
              .range(from, to)
          ),
        ])

        if (cancelled) return

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

  // Grupos: atrasadas / al día / sin entrenamientos.
  const groups = useMemo(() => {
    const behindById = new Map((behind || []).map((b) => [b.studentId, b]))
    const late = []
    const ok = []
    const none = []
    for (const r of rows) {
      const b = behindById.get(r.student.id)
      if (b) late.push({ ...r, behind: b })
      else if (r.hasAnyTally) ok.push(r)
      else none.push(r)
    }
    late.sort(
      (a, b) =>
        (a.behind.pct ?? 0) - (b.behind.pct ?? 0) ||
        (a.student?.name || '').localeCompare(b.student?.name || '', 'es')
    )
    return { late, ok, none }
  }, [rows, behind])

  if (loading) {
    return (
      <div className={className}>
        <p className="text-sm text-texto3 py-2">Cargando…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={className}>
        <p className="text-sm text-texto2 py-2">
          Todavía no hay personas con plan de entrenamiento activo.
        </p>
      </div>
    )
  }

  // Una sola persona filtrada: la fila sola.
  if (filterStudentId || rows.length === 1) {
    return (
      <div className={`divide-y divide-linea ${className}`}>
        {rows.map((r) => (
          <AdherenceRow key={r.assignment.id} {...r} />
        ))}
      </div>
    )
  }

  const toggle = (k) => setOpenGroups((g) => ({ ...g, [k]: !g[k] }))

  return (
    <div className={`space-y-3 ${className}`}>
      {groups.late.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-[#92400e] mb-0.5">
            {groups.late.length === 1
              ? '1 persona hizo menos de lo planificado la semana pasada'
              : `${groups.late.length} personas hicieron menos de lo planificado la semana pasada`}
          </p>
          <div className="divide-y divide-linea">
            {groups.late.map((r) => (
              <AdherenceRow key={r.assignment.id} {...r} />
            ))}
          </div>
        </div>
      )}
      <FoldedGroup
        open={!!openGroups.ok}
        onToggle={() => toggle('ok')}
        label={
          groups.ok.length === 1 ? 'Al día: 1 persona' : `Al día: ${groups.ok.length} personas`
        }
        rows={groups.ok}
      />
      <FoldedGroup
        open={!!openGroups.none}
        onToggle={() => toggle('none')}
        label={`Sin entrenamientos registrados: ${groups.none.length}`}
        rows={groups.none}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Grupo plegado: una línea que se despliega
// ─────────────────────────────────────────────────────────────
function FoldedGroup({ open, onToggle, label, rows }) {
  if (rows.length === 0) return null
  return (
    <div className="border-t border-linea pt-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-1.5 text-sm font-medium text-tinta hover:text-primary-700"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown
          size={16}
          className={`text-texto3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="divide-y divide-linea">
          {rows.map((r) => (
            <AdherenceRow key={r.assignment.id} {...r} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Fila de una persona
// ─────────────────────────────────────────────────────────────
function AdherenceRow({ assignment, student, tallies, hasAnyTally, behind = null }) {
  return (
    <Link to={`/coach/students/${student.id}`} className="flex items-center gap-3 py-2.5 group">
      <div className="w-9 h-9 rounded-full bg-durazno-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        <AvatarImage path={student.avatar_url} alt={student.name}>
          <span className="text-primary-700 text-[13px] font-bold">{initials(student.name)}</span>
        </AvatarImage>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-tinta truncate group-hover:text-primary-700">
            {student.name}
          </p>
          <span className="text-[12px] text-texto2 truncate ml-2 max-w-[40%]">
            {assignment.plan?.title || ''}
          </span>
        </div>
        {behind && (
          <span className="pill-warn mt-1 inline-block tabular-nums">
            {behind.completed} de {behind.target} la semana pasada
          </span>
        )}
        <div className="mt-1">
          {hasAnyTally ? (
            <DayTalliesBadge tallies={tallies} variant="compact" />
          ) : (
            <p className="text-[13px] text-texto2">Sin entrenamientos registrados</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-texto3 flex-shrink-0" />
    </Link>
  )
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
