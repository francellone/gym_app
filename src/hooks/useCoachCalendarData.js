import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  startOfWeekMonday,
  endOfWeekSunday,
  getExpectedSessionDates,
  getScheduleMode,
} from '../utils/assignmentHelpers'

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

export const COACH_EVENT_KIND = {
  plan_start: { label: 'Inicio de plan', icon: '▸', dotClass: 'bg-emerald-500',  textClass: 'text-emerald-700' },
  plan_end:   { label: 'Fin de plan',    icon: '◂', dotClass: 'bg-slate-400',    textClass: 'text-slate-600' },
  payment_due:{ label: 'Vencimiento de pago', icon: '$', dotClass: 'bg-amber-500',    textClass: 'text-amber-700' },
  birthday:   { label: 'Cumpleaños',     icon: '🎂', dotClass: 'bg-pink-400',     textClass: 'text-pink-600' },
}

// ── Date utils ────────────────────────────────────────────────
function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfMonth(date) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

function endOfMonth(date) {
  const d = startOfDay(date)
  d.setMonth(d.getMonth() + 1, 0)
  return d
}

function toYMD(date) {
  const d = startOfDay(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYMD(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Rango visible del calendario para un mes anclado:
// lunes de la semana que contiene al día 1 → domingo de la semana
// que contiene al último día del mes.
export function getCalendarWindow(monthAnchor) {
  const first = startOfMonth(monthAnchor)
  const last = endOfMonth(monthAnchor)
  return {
    start: startOfWeekMonday(first),
    end: endOfWeekSunday(last),
  }
}

// ============================================================
// computeCalendarEvents (PURA — testeable sin Supabase)
// ------------------------------------------------------------
// Inputs:
//   students     [{ id, name, birth_date, next_payment_due }]
//   assignments  [{ id, student_id, start_date, end_date,
//                   plan: { title } }]
//   window       { start: Date, end: Date }
//
// Output: Map<YMD, CoachEvent[]>
// ============================================================
export function computeCalendarEvents(students, assignments, window) {
  const map = new Map()
  const push = (ymd, ev) => {
    if (!map.has(ymd)) map.set(ymd, [])
    map.get(ymd).push(ev)
  }

  const startD = startOfDay(window.start)
  const endD = startOfDay(window.end)

  const inWindow = (d) => d >= startD && d <= endD

  // ── Plan starts / ends ──────────────────────────────────────
  for (const a of assignments || []) {
    const student = (students || []).find(s => s.id === a.student_id)
    const studentName = student?.name || '—'
    const planTitle = a.plan?.title || 'Plan'

    const sd = parseYMD(a.start_date)
    if (sd && inWindow(sd)) {
      push(toYMD(sd), {
        type: 'plan_start',
        date: toYMD(sd),
        title: `Inicia ${planTitle}`,
        studentId: a.student_id,
        studentName,
        planTitle,
      })
    }
    const ed = parseYMD(a.end_date)
    if (ed && inWindow(ed)) {
      push(toYMD(ed), {
        type: 'plan_end',
        date: toYMD(ed),
        title: `Fin de ${planTitle}`,
        studentId: a.student_id,
        studentName,
        planTitle,
      })
    }
  }

  // ── Vencimientos de pago ────────────────────────────────────
  for (const s of students || []) {
    const pd = parseYMD(s.next_payment_due)
    if (pd && inWindow(pd)) {
      push(toYMD(pd), {
        type: 'payment_due',
        date: toYMD(pd),
        title: `Vence pago: ${s.name}`,
        studentId: s.id,
        studentName: s.name,
      })
    }
  }

  // ── Cumpleaños (recurrente anual) ───────────────────────────
  // Iteramos día por día del rango y matcheamos por (mes, día).
  // El rango es como mucho ~6 semanas, cuesta nada.
  const birthdayIndex = new Map() // 'MM-DD' → [students]
  for (const s of students || []) {
    const bd = parseYMD(s.birth_date)
    if (!bd) continue
    const key = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
    if (!birthdayIndex.has(key)) birthdayIndex.set(key, [])
    birthdayIndex.get(key).push(s)
  }
  if (birthdayIndex.size > 0) {
    let cursor = startOfDay(startD)
    while (cursor <= endD) {
      const k = `${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      const matches = birthdayIndex.get(k)
      if (matches) {
        const ymd = toYMD(cursor)
        for (const s of matches) {
          push(ymd, {
            type: 'birthday',
            date: ymd,
            title: `Cumple ${s.name}`,
            studentId: s.id,
            studentName: s.name,
          })
        }
      }
      cursor = addDays(cursor, 1)
    }
  }

  return map
}

// ============================================================
// computeStudentDayStatus (PURA — testeable)
// ------------------------------------------------------------
// Determina el estado de UN día para UN alumno. Usado en modo
// individual (1 alumno seleccionado) para colorear cada celda.
//
// Inputs:
//   ymd               'YYYY-MM-DD'
//   expectedSet       Set<YMD>   días esperados en la ventana
//   completedSet      Set<YMD>   días con sesión registrada
//   today             Date       referencia de "hoy"
//
// Output: 'planned_done' | 'planned_missed' | 'planned_future'
//       | 'unplanned_done' | 'rest'
// ============================================================
export function computeStudentDayStatus(ymd, expectedSet, completedSet, today) {
  const isExpected = expectedSet.has(ymd)
  const isDone = completedSet.has(ymd)
  if (isExpected && isDone) return 'planned_done'
  if (isExpected && !isDone) {
    const d = parseYMD(ymd)
    if (d && d > startOfDay(today)) return 'planned_future'
    return 'planned_missed'
  }
  if (!isExpected && isDone) return 'unplanned_done'
  return 'rest'
}

export const STUDENT_DAY_STYLE = {
  planned_done:    { label: 'Cumplido',          icon: '✓', dotClass: 'bg-emerald-500',  ringClass: 'ring-emerald-300' },
  planned_missed:  { label: 'No asistió',        icon: '✗', dotClass: 'bg-rose-500',     ringClass: 'ring-rose-300' },
  planned_future:  { label: 'Próximo',           icon: '○', dotClass: 'bg-slate-300',    ringClass: 'ring-slate-200' },
  unplanned_done:  { label: 'Día extra',         icon: '+', dotClass: 'bg-blue-400',     ringClass: 'ring-blue-300' },
  rest:            { label: 'Descanso',          icon: '·', dotClass: 'bg-transparent',  ringClass: '' },
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
          const sessionsRes = await supabase
            .from('workout_sessions')
            .select('student_id, logged_date')
            .in('student_id', sel)
            .gte('logged_date', windowStartYMD)
            .lte('logged_date', windowEndYMD)

          if (cancelled || reqIdRef.current !== myReqId) return

          for (const row of sessionsRes.data || []) {
            const sid = row.student_id
            if (!completedMap[sid]) completedMap[sid] = new Set()
            completedMap[sid].add(String(row.logged_date).slice(0, 10))
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
  const perStudentDays = useMemo(() => {
    const out = new Map()
    const sel = new Set((selectedStudentIds || []))
    if (sel.size === 0) return out

    for (const sid of sel) {
      // Tomamos la asignación 'active' de training de ese alumno
      // (debería ser una sola gracias al índice parcial único).
      const a = assignments.find(
        x => x.student_id === sid && x.status === 'active'
      ) || null

      const expected = new Set()
      if (a && getScheduleMode(a) === 'fixed') {
        for (const ymd of getExpectedSessionDates(a, window.start, window.end)) {
          expected.add(ymd)
        }
      }

      out.set(sid, {
        assignment: a,
        expected,
        completed: completedByStudent[sid] || new Set(),
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
