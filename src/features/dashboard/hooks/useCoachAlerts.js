import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { computeAllAlerts, ALERT_THRESHOLDS } from '../alerts'

// ============================================================
// useCoachAlerts
// ------------------------------------------------------------
// Hook que orquesta los fetches y delega el cómputo a las funciones
// puras de coachAlerts.js.
//
// Devuelve:
//   { loading, alerts, refresh, error }
//
// alerts = {
//   overdue, dueSoon, noActivePlan,
//   planExpiringSoon, inactiveStudents, highRpeStudents
// }
//
// Diseño de fetches:
//   - profiles activos con plan_assignments embebidos (igual al
//     fetch original del dashboard, pero ampliado para incluir
//       end_date de la asignación y el title del plan).
//   - workout_logs en una ventana suficiente para alimentar a
//     ambas alertas que dependen de logs:
//       * inactividad: necesitamos last log per student → 30 días
//         alcanzan para detectar inactivos típicos. Si nadie logueó
//         en esa ventana, los marcamos con daysSince=Infinity igual.
//       * RPE alto sostenido: solo mira los últimos
//         HIGH_RPE_WINDOW_DAYS (14 por default) → cubierto.
// ============================================================
export default function useCoachAlerts() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [refreshTick, setRefreshTick] = useState(0)
  const reqIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const myReqId = ++reqIdRef.current
    setLoading(true)
    setError(null)

    async function run() {
      try {
        const today = new Date()
        const ymdToday = formatYMD(today)
        const logsLookbackDays = Math.max(
          30,
          ALERT_THRESHOLDS.HIGH_RPE_WINDOW_DAYS + 1,
          ALERT_THRESHOLDS.STAGNATION_WINDOW_DAYS + 1
        )
        const ymdSince = formatYMD(addDaysSafe(today, -logsLookbackDays))
        const wellbeingLookbackDays = Math.max(
          ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS,
          ALERT_THRESHOLDS.PAIN_WINDOW_DAYS
        )
        const ymdWellbeingSince = formatYMD(addDaysSafe(today, -wellbeingLookbackDays))

        const [studentsRes, logsRes, wellbeingRes] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              `
              id, name, next_payment_due,
              plan_assignments:plan_assignments!student_id(
                id, active, status, plan_type, end_date,
                plan:plans!plan_id(plan_type, title, sessions_per_week)
              )
            `
            )
            .eq('role', 'student')
            .eq('active', true),
          // Sumamos actual_weight + plan_exercise → exercise.name para que
          // la alerta de estancamiento sea por ejercicio (no aggregate).
          supabase
            .from('workout_logs')
            .select(
              `student_id, logged_date, perceived_difficulty, actual_weight, plan_exercise_id,
               plan_exercise:plan_exercises!plan_exercise_id(
                 exercise:exercises!exercise_id(id, name)
               )`
            )
            .gte('logged_date', ymdSince)
            .lte('logged_date', ymdToday),
          supabase
            .from('wellbeing_logs')
            .select('user_id, date, energy_level, muscle_fatigue, stress_level, notes')
            .gte('date', ymdWellbeingSince)
            .lte('date', ymdToday),
        ])

        if (cancelled || reqIdRef.current !== myReqId) return

        if (studentsRes.error) throw studentsRes.error
        if (logsRes.error) throw logsRes.error
        if (wellbeingRes.error) throw wellbeingRes.error

        setStudents(studentsRes.data || [])
        setLogs(logsRes.data || [])
        setWellbeingLogs(wellbeingRes.data || [])
      } catch (err) {
        console.error('[useCoachAlerts] fetch', err)
        if (!cancelled && reqIdRef.current === myReqId) setError(err)
      } finally {
        if (!cancelled && reqIdRef.current === myReqId) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  // Pre-computamos last log date por alumno (solo se rehace si cambian
  // los logs).
  const lastLogDateByStudent = useMemo(() => {
    const map = new Map()
    for (const l of logs) {
      const sid = l.student_id
      const ymd = String(l.logged_date).slice(0, 10)
      const cur = map.get(sid)
      if (!cur || ymd > cur) map.set(sid, ymd)
    }
    return map
  }, [logs])

  // Adherencia sobre una VENTANA MÓVIL de los últimos 7 días:
  //   target    = sessions_per_week del plan training activo (>0)
  //   completed = días distintos de entrenamiento en los últimos 7 días
  // Usamos ventana móvil (no semana calendario lun-dom) para evitar el
  // falso positivo de principio de semana: un martes, la "semana en
  // curso" recién arranca y casi nadie llegó a sus N sesiones todavía,
  // así que la alerta dispararía para todos. La ventana de 7 días
  // siempre es una semana completa. La lógica pura (computeLowAdherence)
  // decide el umbral; acá solo armamos los datos.
  const adherenceByStudent = useMemo(() => {
    const windowStart = formatYMD(addDaysSafe(new Date(), -6)) // hoy + 6 días previos = 7
    const todayYmd = formatYMD(new Date())

    // target por alumno desde su asignación de training activa
    const targetByStudent = new Map()
    for (const s of students) {
      const a = (s.plan_assignments || []).find((x) => {
        const pt = x.plan_type || x.plan?.plan_type || 'training'
        if (pt !== 'training') return false
        return x.status ? x.status === 'active' : !!x.active
      })
      const spw = Number(a?.plan?.sessions_per_week)
      if (Number.isFinite(spw) && spw > 0) targetByStudent.set(s.id, spw)
    }

    // días distintos entrenados en los últimos 7 días por alumno
    const datesByStudent = new Map()
    for (const l of logs) {
      const ymd = String(l.logged_date).slice(0, 10)
      if (ymd < windowStart || ymd > todayYmd) continue
      if (!datesByStudent.has(l.student_id)) datesByStudent.set(l.student_id, new Set())
      datesByStudent.get(l.student_id).add(ymd)
    }

    const map = new Map()
    for (const [sid, target] of targetByStudent) {
      map.set(sid, { target, completed: datesByStudent.get(sid)?.size || 0 })
    }
    return map
  }, [students, logs])

  const alerts = useMemo(
    () =>
      computeAllAlerts({
        students,
        lastLogDateByStudent,
        adherenceByStudent,
        recentLogs: logs,
        wellbeingLogs,
        today: new Date(),
      }),
    [students, lastLogDateByStudent, adherenceByStudent, logs, wellbeingLogs]
  )

  function refresh() {
    setRefreshTick((t) => t + 1)
  }

  return { loading, error, alerts, refresh }
}

// ── Date utils locales ──
function formatYMD(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysSafe(date, n) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}
