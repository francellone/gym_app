import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
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
          ALERT_THRESHOLDS.STAGNATION_WINDOW_DAYS + 1,
          // suficientes semanas cerradas para la alerta de declive
          7 * (ALERT_THRESHOLDS.ADHERENCE_DECLINE_WEEKS + 3) + 7
        )
        const ymdSince = formatYMD(addDaysSafe(today, -logsLookbackDays))
        const wellbeingLookbackDays = Math.max(
          ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS,
          ALERT_THRESHOLDS.PAIN_WINDOW_DAYS
        )
        const ymdWellbeingSince = formatYMD(addDaysSafe(today, -wellbeingLookbackDays))

        // ⚠️ Supabase devuelve máx. 1000 filas por request, EN SILENCIO.
        // workout_logs en 49 días ya supera eso (bug 2026-08-27: la alerta
        // de inactividad marcaba 22/23 alumnos porque a la mayoría le
        // faltaban los logs recientes en la página truncada). Por eso los
        // fetches de logs paginan con fetchAllRows + orden estable.
        const [studentsRes, logRows, wellbeingRows] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              `
              id, name, next_payment_due,
              plan_assignments:plan_assignments!student_id(
                id, active, status, plan_type, start_date, end_date,
                plan:plans!plan_id(plan_type, title, sessions_per_week)
              )
            `
            )
            .eq('role', 'student')
            .eq('active', true),
          // Sumamos actual_weight + plan_exercise → exercise.name para que
          // la alerta de estancamiento sea por ejercicio (no aggregate).
          fetchAllRows((from, to) =>
            supabase
              .from('workout_logs')
              .select(
                `id, student_id, logged_date, perceived_difficulty, actual_weight, plan_exercise_id,
                 plan_exercise:plan_exercises!plan_exercise_id(
                   exercise:exercises!exercise_id(id, name)
                 )`
              )
              .gte('logged_date', ymdSince)
              .lte('logged_date', ymdToday)
              .order('logged_date', { ascending: true })
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('wellbeing_logs')
              .select('id, user_id, date, energy_level, muscle_fatigue, stress_level, notes')
              .gte('date', ymdWellbeingSince)
              .lte('date', ymdToday)
              .order('date', { ascending: true })
              .order('id', { ascending: true })
              .range(from, to)
          ),
        ])

        if (cancelled || reqIdRef.current !== myReqId) return

        if (studentsRes.error) throw studentsRes.error

        setStudents(studentsRes.data || [])
        setLogs(logRows)
        setWellbeingLogs(wellbeingRows)
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

  // Adherencia por SEMANAS CERRADAS (lun-dom ya terminadas).
  //   target    = sessions_per_week del plan training activo (>0)
  //   completed = días distintos entrenados en esa semana (cap a target)
  // Nunca se mide la semana en curso (evita el falso positivo de
  // principio de semana). Devolvemos por alumno un array ascendente de
  // semanas cerradas; la lógica pura (computeLowAdherence /
  // computeAdherenceDecline) decide los umbrales.
  const weeklyByStudent = useMemo(() => {
    const WEEKS = ALERT_THRESHOLDS.ADHERENCE_DECLINE_WEEKS + 2

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay() // 0=dom..6=sáb
    const thisMonday = new Date(today)
    thisMonday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow))

    // target + start_date del plan training activo, por alumno
    const meta = new Map()
    for (const s of students) {
      const a = (s.plan_assignments || []).find((x) => {
        const pt = x.plan_type || x.plan?.plan_type || 'training'
        if (pt !== 'training') return false
        return x.status ? x.status === 'active' : !!x.active
      })
      const spw = Number(a?.plan?.sessions_per_week)
      if (Number.isFinite(spw) && spw > 0) {
        meta.set(s.id, {
          target: spw,
          start: a?.start_date ? String(a.start_date).slice(0, 10) : null,
        })
      }
    }

    // fechas distintas entrenadas por alumno (dentro de los logs traídos)
    const datesByStudent = new Map()
    for (const l of logs) {
      const ymd = String(l.logged_date).slice(0, 10)
      if (!datesByStudent.has(l.student_id)) datesByStudent.set(l.student_id, new Set())
      datesByStudent.get(l.student_id).add(ymd)
    }

    const map = new Map()
    for (const [sid, { target, start }] of meta) {
      const dates = datesByStudent.get(sid) || new Set()
      const weeks = []
      // de la más vieja (i=WEEKS) a la más reciente (i=1) → ascendente
      for (let i = WEEKS; i >= 1; i--) {
        const ws = new Date(thisMonday)
        ws.setDate(thisMonday.getDate() - 7 * i)
        const we = new Date(ws)
        we.setDate(ws.getDate() + 6)
        const wsY = formatYMD(ws)
        const weY = formatYMD(we)
        // solo semanas completas bajo el plan (no penalizar pre-asignación)
        if (start && wsY < start) continue
        let completed = 0
        for (const d of dates) if (d >= wsY && d <= weY) completed += 1
        const capped = Math.min(completed, target)
        const pct = Math.round((capped / target) * 100)
        weeks.push({ weekStart: wsY, completed, target, pct })
      }
      if (weeks.length > 0) map.set(sid, weeks)
    }
    return map
  }, [students, logs])

  const alerts = useMemo(
    () =>
      computeAllAlerts({
        students,
        lastLogDateByStudent,
        weeklyByStudent,
        recentLogs: logs,
        wellbeingLogs,
        today: new Date(),
      }),
    [students, lastLogDateByStudent, weeklyByStudent, logs, wellbeingLogs]
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
