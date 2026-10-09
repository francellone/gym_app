import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getScheduleMode } from '@/features/plans/assignmentHelpers'
import { computeDateCompleteness } from '@/features/students/dayTalliesLogic'
import { fetchAllRows } from '@/lib/fetchAllRows'
import i18n from '@/i18n'
import { ACTIVITY_TYPES } from '@/features/activities/api'
import {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  getCalendarWindow,
  computeCalendarEvents,
  computeStudentDayStatus,
  computeFlexibleOverflowSet,
  MILESTONE_KINDS_IN_CALENDAR,
  buildStudentCalendarDays,
} from '../calendarLogic'

// Re-exports para mantener la API histórica del hook
// (MonthlyCalendar.jsx y futuros consumidores).
export {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  getCalendarWindow,
  computeCalendarEvents,
  computeStudentDayStatus,
  computeFlexibleOverflowSet,
}

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
//       * plan_assignments cuyo rango (start_date..closed_at)
//           interseca con la ventana visible del calendario,
//           más las 'active' (que no tengan closed_at pueden
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
//                                          partial: Set<YMD>,
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
//     'evaluation'    pendiente (plan_assignments de evaluación)
//     'evaluation_done' hecha (evaluation_results.eval_date)
//     2026-09-27:
//     'form_scheduled' | 'form_unanswered' | 'form_answered'
//                     (intake_form_assignments, uno por formulario)
//     'payment_done'  (payments.paid_on)
//     'activity'      (activity_logs.date)
//     'milestone'     (student_milestones.created_at)
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

// Columnas y filtro de ventana de plan_assignments (los usan las dos partes).
const ASSIGNMENT_COLUMNS = `
  id, student_id, plan_id, status, plan_type, active,
  start_date, closed_at, expected_end_date, expected_end_source,
  schedule_mode, preferred_days,
  plan:plans!plan_id(title, sessions_per_week, plan_type)
`
function assignmentWindowFilter(startYMD, endYMD) {
  return (
    `and(start_date.lte.${endYMD},closed_at.gte.${startYMD}),` +
    `and(start_date.lte.${endYMD},closed_at.is.null)`
  )
}
function isTrainingAssignment(a) {
  return (a.plan_type || a.plan?.plan_type || 'training') === 'training'
}

// ============================================================
// Hook principal
// ============================================================
// opts (rediseño 2026-09-26):
//   window      { start, end } explícito en vez del mes (lo usa la
//               agenda de los próximos 7 días, que cruza meses)
//   eventsOnly  true → no trae sesiones (ni por persona ni el conteo
//               "N entrenaron"); solo eventos
export default function useCoachCalendarData(monthAnchor, selectedStudentIds, opts = {}) {
  const { window: windowOverride = null, eventsOnly = false } = opts
  const overrideStart = windowOverride ? toYMD(windowOverride.start) : null
  const overrideEnd = windowOverride ? toYMD(windowOverride.end) : null
  const window = useMemo(
    () =>
      overrideStart
        ? { start: parseLocalYMD(overrideStart), end: parseLocalYMD(overrideEnd) }
        : getCalendarWindow(monthAnchor),
    [monthAnchor, overrideStart, overrideEnd]
  )
  const windowStartYMD = toYMD(window.start)
  const windowEndYMD = toYMD(window.end)

  // Normalizamos la selección en una clave estable para el effect.
  const selectionKey = useMemo(
    () => (selectedStudentIds || []).slice().sort().join(','),
    [selectedStudentIds]
  )

  const [students, setStudents] = useState([])
  const [assignments, setAssignments] = useState([])
  // Todas las asignaciones (training + evaluaciones) para los eventos.
  const [eventAssignments, setEventAssignments] = useState([])
  // Modo "todas las personas": QUIÉNES entrenaron cada día
  // (Map<YMD, Set<studentId>>) → la celda dice "5 entrenaron" y el
  // detalle del día lista los nombres.
  const [trainedByDate, setTrainedByDate] = useState(new Map())
  // Evaluaciones hechas en la ventana (evaluation_results).
  const [evalResults, setEvalResults] = useState([])
  // 2026-09-27: formularios, pagos cobrados, actividades extra y festejos.
  const [extras, setExtras] = useState({})
  const [completedByStudent, setCompletedByStudent] = useState({}) // { studentId: Map<plan_id, Set<YMD>> }
  // Días CON sesión pero SIN el entrenamiento completo (ver computeDateCompleteness).
  const [partialByStudent, setPartialByStudent] = useState({}) // { studentId: Map<plan_id, Set<YMD>> }
  const [refreshTick, setRefreshTick] = useState(0)

  // Evitamos pisarnos con respuestas viejas si el coach navega rápido.
  // Un contador por efecto: el global y el de la persona son independientes.
  const globalReqRef = useRef(0)
  const personReqRef = useRef(0)
  const [globalLoading, setGlobalLoading] = useState(true)
  const [personLoading, setPersonLoading] = useState(false)

  // ── Parte GLOBAL (2026-10-09) ──────────────────────────────
  // Depende solo de la ventana. Antes estaba en el mismo efecto que la parte
  // de la persona, así que elegir a alguien volvía a traer TODO (personas,
  // asignaciones, evaluaciones, formularios, pagos, actividades, festejos y
  // el conteo de "N entrenaron") y recién después, en serie, lo de esa
  // persona. Con la instancia de Supabase lenta y el resto del dashboard
  // recargando a la vez, eran 25-30 requests contra un pool de 10.
  useEffect(() => {
    let cancelled = false
    const myReqId = ++globalReqRef.current
    setGlobalLoading(true)

    async function run() {
      try {
        // Rango con hora para las columnas timestamptz (festejos).
        const tsStart = parseLocalYMD(windowStartYMD).toISOString()
        const tsEndD = parseLocalYMD(windowEndYMD)
        tsEndD.setDate(tsEndD.getDate() + 1)
        const tsEnd = tsEndD.toISOString()
        // Si alguno de estos falla, el calendario sigue sin ese tipo.
        const soft = (label) => (err) => {
          console.error(`[useCoachCalendarData] ${label}`, err)
          return []
        }

        const [
          studentsRes,
          assignmentsRes,
          evalResultsRows,
          formRows,
          paymentRows,
          activityRows,
          milestoneRows,
          trainedRows,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, name, avatar_url, birth_date, next_payment_due, active')
            .eq('role', 'student')
            .eq('active', true)
            .order('name', { ascending: true }),
          // Asignaciones que tocan la ventana visible de alguna forma.
          // Consulta amplia: cualquier asignación cuyo rango intersecte
          // la ventana, o sin closed_at (todavía vigente).
          // Filtramos por coach via RLS — ya está cubierto.
          supabase
            .from('plan_assignments')
            .select(ASSIGNMENT_COLUMNS)
            .or(assignmentWindowFilter(windowStartYMD, windowEndYMD)),
          // Evaluaciones HECHAS en la ventana: van al calendario en el día
          // en que se hicieron (antes desaparecían al completarse).
          fetchAllRows((from, to) =>
            supabase
              .from('evaluation_results')
              .select('id, student_id, plan_id, eval_date, plan:plans!plan_id(title)')
              .gte('eval_date', windowStartYMD)
              .lte('eval_date', windowEndYMD)
              .order('id', { ascending: true })
              .range(from, to)
          ).catch(soft('evaluation_results')),
          // Formularios: todos (son pocos); la función pura decide en qué
          // día y con qué estado va cada uno.
          fetchAllRows((from, to) =>
            supabase
              .from('intake_form_assignments')
              .select(
                'id, student_id, status, form_kind, sent_at, scheduled_for, completed_at, created_at, template:intake_form_templates!template_id(name)'
              )
              .order('id', { ascending: true })
              .range(from, to)
          ).catch(soft('intake_form_assignments')),
          fetchAllRows((from, to) =>
            supabase
              .from('payments')
              .select('id, student_id, paid_on')
              .gte('paid_on', windowStartYMD)
              .lte('paid_on', windowEndYMD)
              .order('id', { ascending: true })
              .range(from, to)
          ).catch(soft('payments')),
          fetchAllRows((from, to) =>
            supabase
              .from('activity_logs')
              .select('id, student_id, date, activity_type, label')
              .gte('date', windowStartYMD)
              .lte('date', windowEndYMD)
              .order('id', { ascending: true })
              .range(from, to)
          ).catch(soft('activity_logs')),
          fetchAllRows((from, to) =>
            supabase
              .from('student_milestones')
              .select('id, student_id, kind, created_at, voided_at, payload')
              .in('kind', MILESTONE_KINDS_IN_CALENDAR)
              .is('voided_at', null)
              .gte('created_at', tsStart)
              .lt('created_at', tsEnd)
              .order('id', { ascending: true })
              .range(from, to)
          ).catch(soft('student_milestones')),
          // "N entrenaron" del modo todas las personas. Se trae siempre
          // (es una sola consulta) para que volver a "todas" sea inmediato.
          eventsOnly
            ? Promise.resolve([])
            : fetchAllRows((from, to) =>
                supabase
                  .from('workout_sessions')
                  .select('id, student_id, logged_date, plans!inner(plan_type)')
                  .eq('plans.plan_type', 'training')
                  .gte('logged_date', windowStartYMD)
                  .lte('logged_date', windowEndYMD)
                  .order('id', { ascending: true })
                  .range(from, to)
              ).catch(soft('workout_sessions')),
        ])

        if (cancelled || globalReqRef.current !== myReqId) return

        const studentsData = studentsRes.data || []
        const activeIds = new Set(studentsData.map((s) => s.id))
        const trainedMap = new Map()
        for (const r of trainedRows || []) {
          if (!activeIds.has(r.student_id)) continue
          const ymd = String(r.logged_date).slice(0, 10)
          if (!trainedMap.has(ymd)) trainedMap.set(ymd, new Set())
          trainedMap.get(ymd).add(r.student_id)
        }

        setStudents(studentsData)
        // Solo TRAINING para los días por persona; las evaluaciones van
        // como eventos (eventAssignments).
        setAssignments((assignmentsRes.data || []).filter(isTrainingAssignment))
        setEventAssignments(assignmentsRes.data || [])
        setTrainedByDate(trainedMap)
        setEvalResults(evalResultsRows || [])
        setExtras({
          forms: formRows || [],
          payments: paymentRows || [],
          activities: (activityRows || []).map(toActivityEvent),
          milestones: milestoneRows || [],
        })
      } catch (err) {
        // No reventamos el dashboard; logueamos.
        console.error('[useCoachCalendarData] fetch global', err)
      } finally {
        if (!cancelled && globalReqRef.current === myReqId) setGlobalLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [windowStartYMD, windowEndYMD, refreshTick, eventsOnly])

  // ── Parte de la PERSONA elegida (2026-10-09) ───────────────
  // Solo lo de las personas seleccionadas, en dos tandas en vez de tres:
  //   1. sus asignaciones de la ventana + sesiones + registros (en paralelo)
  //   2. la estructura de sus planes (ejercicios y bloques) para distinguir
  //      completo de parcial.
  // Mientras carga, lo que ya estaba en pantalla no se borra.
  useEffect(() => {
    const sel = (selectionKey || '').split(',').filter(Boolean)
    if (eventsOnly || sel.length === 0) {
      setPersonLoading(false)
      return undefined
    }
    let cancelled = false
    const myReqId = ++personReqRef.current
    setPersonLoading(true)

    async function run() {
      try {
        // ── Historial completo (2026-10-04) ──────────────────────
        // Entran todos sus planes de TRAINING que tocan la ventana (activos,
        // reemplazados, terminados); cada día se evalúa con el plan vigente
        // ese día (buildStudentCalendarDays). Las sesiones de evaluaciones
        // quedan afuera porque se filtra por los planes de training, y el
        // cupo flexible se calcula por plan, así que la transición entre
        // planes no inventa "días extra".
        const inWindow = (q) =>
          q
            .in('student_id', sel)
            .gte('logged_date', windowStartYMD)
            .lte('logged_date', windowEndYMD)
            .order('id', { ascending: true })

        const [assignRes, sessionRows, logRows, blockLogRows] = await Promise.all([
          supabase
            .from('plan_assignments')
            .select('plan_id, student_id, plan_type, plan:plans!plan_id(plan_type)')
            .in('student_id', sel)
            .or(assignmentWindowFilter(windowStartYMD, windowEndYMD)),
          fetchAllRows((from, to) =>
            inWindow(
              supabase.from('workout_sessions').select('id, student_id, plan_id, logged_date')
            ).range(from, to)
          ),
          // "Existe sesión" no alcanza para pintar verde (2026-08-27: Andrea
          // entrenaba solo la activación). Paginado (corte mudo de 1000).
          fetchAllRows((from, to) =>
            inWindow(
              supabase
                .from('workout_logs')
                .select('student_id, plan_id, logged_date, completed, status, plan_exercise_id')
            ).range(from, to)
          ),
          fetchAllRows((from, to) =>
            inWindow(
              supabase
                .from('workout_block_logs')
                .select('student_id, plan_id, logged_date, completed, status, plan_block_id')
            ).range(from, to)
          ),
        ])
        if (cancelled || personReqRef.current !== myReqId) return

        const trainingPlanIds = [
          ...new Set((assignRes.data || []).filter(isTrainingAssignment).map((a) => a.plan_id)),
        ]
        const isTrainingPlan = new Set(trainingPlanIds)

        const [peRows, pbRows] =
          trainingPlanIds.length > 0
            ? await Promise.all([
                fetchAllRows((from, to) =>
                  supabase
                    .from('plan_exercises')
                    .select('id, plan_id, section, block_id')
                    .in('plan_id', trainingPlanIds)
                    .order('id', { ascending: true })
                    .range(from, to)
                ),
                fetchAllRows((from, to) =>
                  supabase
                    .from('plan_blocks')
                    .select('id, plan_id, section, block_type')
                    .in('plan_id', trainingPlanIds)
                    .order('id', { ascending: true })
                    .range(from, to)
                ),
              ])
            : [[], []]
        if (cancelled || personReqRef.current !== myReqId) return

        // completedMap[sid] = Map<plan_id, Set<YMD>>
        const completedMap = {}
        for (const row of sessionRows) {
          if (!isTrainingPlan.has(row.plan_id)) continue
          const sid = row.student_id
          if (!completedMap[sid]) completedMap[sid] = new Map()
          if (!completedMap[sid].has(row.plan_id)) completedMap[sid].set(row.plan_id, new Set())
          completedMap[sid].get(row.plan_id).add(String(row.logged_date).slice(0, 10))
        }

        const partialMap = {}
        for (const sid of sel) {
          const byPlan = completedMap[sid]
          if (!byPlan) continue
          for (const [planId, sessionDates] of byPlan) {
            const completeness = computeDateCompleteness({
              logs: logRows.filter((l) => l.student_id === sid && l.plan_id === planId),
              blockLogs: blockLogRows.filter((b) => b.student_id === sid && b.plan_id === planId),
              planExercises: peRows.filter((pe) => pe.plan_id === planId),
              planBlocks: pbRows.filter((pb) => pb.plan_id === planId),
              dates: [...sessionDates],
            })
            const partial = new Set()
            for (const ymd of sessionDates) {
              if (completeness.get(ymd) === 'partial') partial.add(ymd)
            }
            if (partial.size > 0) {
              if (!partialMap[sid]) partialMap[sid] = new Map()
              partialMap[sid].set(planId, partial)
            }
          }
        }

        setCompletedByStudent(completedMap)
        setPartialByStudent(partialMap)
      } catch (err) {
        console.error('[useCoachCalendarData] fetch persona', err)
      } finally {
        if (!cancelled && personReqRef.current === myReqId) setPersonLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [windowStartYMD, windowEndYMD, selectionKey, refreshTick, eventsOnly])

  const loading = globalLoading || personLoading

  // Eventos del coach (siempre).
  const eventsByDate = useMemo(
    () =>
      computeCalendarEvents(students, eventAssignments, window, new Date(), evalResults, extras),
    [students, eventAssignments, window, evalResults, extras]
  )

  // Nombres de quienes entrenaron cada día, en orden alfabético.
  const trainedNamesByDate = useMemo(() => {
    const nameById = new Map(students.map((s) => [s.id, String(s.name || '').trim()]))
    const out = new Map()
    for (const [ymd, ids] of trainedByDate) {
      out.set(
        ymd,
        [...ids]
          .map((id) => nameById.get(id))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'es'))
      )
    }
    return out
  }, [students, trainedByDate])
  const trainedCountByDate = useMemo(() => {
    const out = new Map()
    for (const [ymd, names] of trainedNamesByDate) out.set(ymd, names.length)
    return out
  }, [trainedNamesByDate])

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
    const sel = new Set(selectedStudentIds || [])
    if (sel.size === 0) return out

    for (const sid of sel) {
      // Todas sus asignaciones de training en la ventana (2026-10-04).
      const own = assignments.filter(
        (x) => x.student_id === sid && (x.plan_type || 'training') === 'training'
      )
      // La activa sigue mandando en el resumen ("Plan: lunes y
      // miércoles") y en el modo por defecto.
      const a = own.find((x) => x.status === 'active') || null

      const days = buildStudentCalendarDays({
        assignments: own,
        sessionsByPlan: completedByStudent[sid] || new Map(),
        partialByPlan: partialByStudent[sid] || new Map(),
        windowStart: window.start,
        windowEnd: window.end,
      })

      out.set(sid, {
        assignment: a,
        scheduleMode: getScheduleMode(a),
        expected: days.expected,
        completed: days.completed,
        partial: days.partial,
        flexibleOverflow: days.flexibleOverflow,
        modeByDate: days.modeByDate,
      })
    }
    return out
  }, [assignments, completedByStudent, partialByStudent, selectedStudentIds, window])

  const selectedStudents = useMemo(() => {
    const sel = new Set(selectedStudentIds || [])
    if (sel.size === 0) return []
    return students.filter((s) => sel.has(s.id))
  }, [students, selectedStudentIds])

  function refresh() {
    setRefreshTick((t) => t + 1)
  }

  return {
    loading,
    refresh,
    window,
    students,
    selectedStudents,
    eventsByDate,
    perStudentDays,
    trainedCountByDate,
    trainedNamesByDate,
  }
}

// Actividad extra → emoji + nombre en el idioma de la app. Los tipos
// libres ("Otro deporte", "Otra") usan lo que escribió la persona.
const ACTIVITY_BY_KEY = new Map(ACTIVITY_TYPES.map((t) => [t.key, t]))
function toActivityEvent(row) {
  const t = ACTIVITY_BY_KEY.get(row.activity_type)
  const typeName = t ? i18n.t(t.i18n) : ''
  return {
    student_id: row.student_id,
    date: row.date,
    emoji: t?.emoji || '✨',
    // Sin nombre → la UI pone "Actividad" traducido (titleFallback).
    name: (row.label && String(row.label).trim()) || typeName || null,
  }
}

function parseLocalYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
