import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getExpectedSessionDates,
  getScheduleMode,
} from '@/features/plans/assignmentHelpers'
import {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  getCalendarWindow,
  computeCalendarEvents,
  computeStudentDayStatus,
  computeFlexibleOverflowSet,
} from '../calendarLogic'

// Re-exports para mantener la API histórica del hook
// (MonthlyCalendar.jsx y futuros consumidores).
export { COACH_EVENT_KIND, STUDENT_DAY_STYLE, getCalendarWindow,
         computeCalendarEvents, computeStudentDayStatus,
         computeFlexibleOverflowSet }

// ── Constantes locales ───────────────────────────────────────
// schedule_mode posibles. Se replican acá para no acoplar este
// hook con el shape exacto de SCHEDULE_MODES en assignmentHelpers.
const SCHED_FIXED = 'fixed'
const SCHED_FLEXIBLE = 'flexible'

// ============================================================
// useCoachCalendarData
// ------------------------------------------------------------
// Hook que alimenta el calendario mensual del dashboard del coach.
//
// Decisión clave de fetching (Fase 3 — diseño con el coach):
//   - SIEMPRE se trae:
//       * profiles activos (id, name, avatar_url, birth_date,
//           next_payment_due) → para el filtro de alumnos
//           Y para los eventos del coach (cumpleaños, pagos).
//       * plan_assignments cuyo rango (start_date..end_date)
//           interseca con la ventana visible del calendario,
//           más las 'active' (que no tengan end_date pueden
//           extenderse indefinidamente). Necesarios para
//           inicios/vencimientos de plan.
//   - SOLO si hay alumnos seleccionados:
//       * workout_sessions (student_id, logged_date) DISTINCT
//           para esos alumnos en la ventana → "días entrenados".
//
// Devuelve:
//   {
//     loading,
//     refresh,           función para re-fetch manual
//     window: { start, end },  rango visible del calendario
//     students,          lista completa para el filter bar
//     selectedStudents,  filtrada y ordenada según selección
//     eventsByDate,      Map<YMD, CoachEvent[]> — siempre presente
//     perStudentDays,    Map<studentId, { expected: Set<YMD>,
//                                          completed: Set<YMD>,
//                                          assignment }>
//                        Solo poblado si hay selección.
//   }
//
// Eventos del coach (CoachEvent):
//   { type, date, title, studentId?, studentName?, planTitle?, color }
//   types soportados:
//     'plan_start'    | 'plan_end'    (de plan_assignments)
//     'payment_due'   (de profiles.next_payment_due)
//     'birthday'      (de profiles.birth_date, recurrente anual)
// ============================================================

// ── Date utils internas ──────────────────────────────────────
// Solo las que el hook necesita para construir el rango YMD del
// effect. La lógica más densa (computeCalendarEvents,
// computeStudentDayStatus, computeFlexibleOverflowSet) y los
// estilos viven en src/utils/calendarLogic.js para poder
// importarse en scripts standalone sin arrastrar React/Supabase.
function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toYMD(date) {
  const d = startOfDay(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ============================================================
// Hook principal
// ============================================================
export default function useCoachCalendarData(monthAnchor, selectedStudentIds) {
  const window = useMemo(() => getCalendarWindow(monthAnchor), [monthAnchor])
  const windowStartYMD = toYMD(window.start)
  const windowEndYMD = toYMD(window.end)

  // Normalizamos la selección en una clave estable para el effect.
  const selectionKey = useMemo(
    () => (selectedStudentIds || []).slice().sort().join(','),
    [selectedStudentIds]
  )

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [assignments, setAssignments] = useState([])
  const [completedByStudent, setCompletedByStudent] = useState({}) // { studentId: Set<YMD> }
  const [refreshTick, setRefreshTick] = useState(0)

  // Evitamos pisarnos con respuestas viejas si el coach navega rápido.
  const reqIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const myReqId = ++reqIdRef.current
    setLoading(true)

    async function run() {
      try {
        const [studentsRes, assignmentsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, name, avatar_url, birth_date, next_payment_due, active')
            .eq('role', 'student')
            .eq('active', true)
            .order('name', { ascending: true }),
          // Asignaciones que tocan la ventana visible de alguna forma.
          // Consulta amplia: cualquier asignación cuyo rango intersecte
          // la ventana, o sin end_date (todavía vigente).
          // Filtramos por coach via RLS — ya está cubierto.
          supabase
            .from('plan_assignments')
            .select(`
              id, student_id, plan_id, status, plan_type,
              start_date, end_date,
              schedule_mode, preferred_days,
              plan:plans!plan_id(title, sessions_per_week)
            `)
            .or(
              `and(start_date.lte.${windowEndYMD},end_date.gte.${windowStartYMD}),` +
              `and(start_date.lte.${windowEndYMD},end_date.is.null)`
            ),
        ])

        if (cancelled || reqIdRef.current !== myReqId) return

        const studentsData = studentsRes.data || []
        // Filtramos asignaciones a las de TRAINING por defecto. Las
        // evaluaciones se podrían sumar después como otro toggle.
        const assignmentsData = (assignmentsRes.data || []).filter(a => {
          const t = a.plan_type || a.plan?.plan_type || 'training'
          return t === 'training'
        })

        let completedMap = {}
        const sel = (selectionKey || '').split(',').filter(Boolean)
        if (sel.length > 0) {
          // ── IMPORTANTE: filtrar por plan_id del plan ACTIVO de TRAINING ──
          // Sin este filtro, el Set de "días entrenados" se contamina con:
          //   1. Sesiones de planes 'replaced' que solapan la ventana
          //      cuando hay transición de un plan al siguiente.
          //   2. Sesiones legacy con plan_id de evaluaciones (escritas
          //      por flujos viejos antes de existir EvalWorkoutPage).
          // Eso inflaba el conteo semanal y empujaba días reales al
          // overflow set (false "Día extra"). Bug reportado: solapamiento
          // entre PLAN 10 (replaced) y PLAN 11 (active) en mayo 2026.
          const activeTrainingPlanIds = assignmentsData
            .filter(a => sel.includes(a.student_id)
                      && a.status === 'active'
                      && a.plan_type === 'training')
            .map(a => a.plan_id)

          if (activeTrainingPlanIds.length > 0) {
            const sessionsRes = await supabase
              .from('workout_sessions')
              .select('student_id, plan_id, logged_date')
              .in('student_id', sel)
              .in('plan_id', activeTrainingPlanIds)
              .gte('logged_date', windowStartYMD)
              .lte('logged_date', windowEndYMD)

            if (cancelled || reqIdRef.current !== myReqId) return

            for (const row of sessionsRes.data || []) {
              const sid = row.student_id
              if (!completedMap[sid]) completedMap[sid] = new Set()
              completedMap[sid].add(String(row.logged_date).slice(0, 10))
            }
          }
        }

        setStudents(studentsData)
        setAssignments(assignmentsData)
        setCompletedByStudent(completedMap)
      } catch (err) {
        // No reventamos el dashboard; logueamos.
        console.error('[useCoachCalendarData] fetch', err)
      } finally {
        if (!cancelled && reqIdRef.current === myReqId) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [windowStartYMD, windowEndYMD, selectionKey, refreshTick])

  // Eventos del coach (siempre).
  const eventsByDate = useMemo(
    () => computeCalendarEvents(students, assignments, window),
    [students, assignments, window]
  )

  // Por alumno: días esperados (de su asignación 'fixed' vigente)
  // y días completados (de workout_sessions). Solo se computa para
  // alumnos seleccionados.
  //
  // Adicionalmente, para asignaciones FLEXIBLES guardamos el set de
  // días que excedieron `sessions_per_week` en su semana — esos sí
  // son "día extra" en serio. Los demás días entrenados se cuentan
  // como cumplidos (porque flexible no exige día específico).
  const perStudentDays = useMemo(() => {
    const out = new Map()
    const sel = new Set((selectedStudentIds || []))
    if (sel.size === 0) return out

    for (const sid of sel) {
      // Tomamos la asignación 'active' de training de ese alumno
      // (debería ser una sola gracias al índice parcial único
      // one_active_training_per_student de migration_v21).
      // El check explícito de plan_type es defensivo: aunque
      // assignmentsData ya viene filtrado a training, blinda contra
      // regresiones si ese filtro upstream cambia.
      const a = assignments.find(
        x => x.student_id === sid
          && x.status === 'active'
          && (x.plan_type || 'training') === 'training'
      ) || null

      const scheduleMode = getScheduleMode(a)
      const completed = completedByStudent[sid] || new Set()

      const expected = new Set()
      if (a && scheduleMode === SCHED_FIXED) {
        for (const ymd of getExpectedSessionDates(a, window.start, window.end)) {
          expected.add(ymd)
        }
      }

      let flexibleOverflow = null
      if (a && scheduleMode === SCHED_FLEXIBLE) {
        const spw = Number(
          a?.plan?.sessions_per_week ?? a?.sessions_per_week ?? 0
        )
        flexibleOverflow = computeFlexibleOverflowSet(completed, spw)
      }

      out.set(sid, {
        assignment: a,
        scheduleMode,
        expected,
        completed,
        flexibleOverflow,
      })
    }
    return out
  }, [assignments, completedByStudent, selectedStudentIds, window])

  const selectedStudents = useMemo(() => {
    const sel = new Set(selectedStudentIds || [])
    if (sel.size === 0) return []
    return students.filter(s => sel.has(s.id))
  }, [students, selectedStudentIds])

  function refresh() {
    setRefreshTick(t => t + 1)
  }

  return {
    loading,
    refresh,
    window,
    students,
    selectedStudents,
    eventsByDate,
    perStudentDays,
  }
}
