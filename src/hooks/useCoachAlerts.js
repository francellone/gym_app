import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeAllAlerts,
  ALERT_THRESHOLDS,
} from '../utils/coachAlerts'

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
        const logsLookbackDays = Math.max(30, ALERT_THRESHOLDS.HIGH_RPE_WINDOW_DAYS + 1)
        const ymdSince = formatYMD(addDaysSafe(today, -logsLookbackDays))

        const [studentsRes, logsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select(`
              id, name, next_payment_due,
              plan_assignments:plan_assignments!student_id(
                id, active, status, plan_type, end_date,
                plan:plans!plan_id(plan_type, title)
              )
            `)
            .eq('role', 'student')
            .eq('active', true),
          supabase
            .from('workout_logs')
            .select('student_id, logged_date, perceived_difficulty')
            .gte('logged_date', ymdSince)
            .lte('logged_date', ymdToday),
        ])

        if (cancelled || reqIdRef.current !== myReqId) return

        if (studentsRes.error) throw studentsRes.error
        if (logsRes.error) throw logsRes.error

        setStudents(studentsRes.data || [])
        setLogs(logsRes.data || [])
      } catch (err) {
        console.error('[useCoachAlerts] fetch', err)
        if (!cancelled && reqIdRef.current === myReqId) setError(err)
      } finally {
        if (!cancelled && reqIdRef.current === myReqId) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
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

  const alerts = useMemo(
    () => computeAllAlerts({
      students,
      lastLogDateByStudent,
      recentLogs: logs,
      today: new Date(),
    }),
    [students, lastLogDateByStudent, logs]
  )

  function refresh() {
    setRefreshTick(t => t + 1)
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
