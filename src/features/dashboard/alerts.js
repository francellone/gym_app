// ============================================================
// coachAlerts.js
// ------------------------------------------------------------
// Lógica PURA y testeable de las alertas del dashboard del coach.
// Sin Supabase, sin React. Solo recibe datos crudos + "today" y
// devuelve listas tipadas listas para renderizar.
//
// Convenciones:
//   - Las funciones aceptan today como Date opcional para facilitar
//     tests deterministas.
//   - Todas las dates se manipulan a granularidad día (sin hora).
//   - Los items devueltos comparten la forma:
//       { studentId, name, ...meta }
//     para que la UI pueda renderizarlos uniformemente.
// ============================================================

// ── Umbrales (centralizados para tunearlos en un solo lugar) ──
export const ALERT_THRESHOLDS = {
  // Pago
  PAYMENT_DUE_SOON_DAYS: 7, // pago dentro de N días
  // Plan
  PLAN_EXPIRING_SOON_DAYS: 7, // plan vence dentro de N días
  // Inactividad
  INACTIVE_DAYS: 3, // sin loguear hace N+ días
  // RPE alto sostenido
  HIGH_RPE_THRESHOLD: 8, // PSE >= N considerado alto
  HIGH_RPE_MIN_OCCURRENCES: 3, // al menos N ocurrencias
  HIGH_RPE_WINDOW_DAYS: 14, // dentro de los últimos N días
}

// ── Date utils ────────────────────────────────────────────────
function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + n)
  return d
}

function daysBetween(a, b) {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime()
  return Math.round(ms / 86400000)
}

function parseYMD(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// ============================================================
// Helpers de "asignación activa de TRAINING"
// ------------------------------------------------------------
// Compatibilidad con la estructura del dashboard actual: cada
// student trae embedded plan_assignments. Reutilizamos los mismos
// criterios usados en CoachDashboard.fetchDashboardData previamente:
//   - status === 'active' (si existe), si no fallback a active boolean
//   - plan_type 'training' (denormalizado o vía plan.plan_type)
// ============================================================
function getActiveTrainingAssignment(student) {
  const list = student?.plan_assignments || []
  return (
    list.find((a) => {
      const planType = a.plan_type || a.plan?.plan_type || 'training'
      if (planType !== 'training') return false
      if (a.status) return a.status === 'active'
      return !!a.active
    }) || null
  )
}

// ============================================================
// 1. Pagos vencidos / vencen pronto
// ------------------------------------------------------------
// Inputs: students [{id, name, next_payment_due}]
// ============================================================
export function computePaymentAlerts(students, today = new Date()) {
  const todayD = startOfDay(today)
  const soonLimit = addDays(todayD, ALERT_THRESHOLDS.PAYMENT_DUE_SOON_DAYS)
  const overdue = []
  const dueSoon = []

  for (const s of students || []) {
    const due = parseYMD(s.next_payment_due)
    if (!due) continue
    if (due < todayD) {
      overdue.push({
        studentId: s.id,
        name: s.name,
        dueDate: s.next_payment_due,
        daysOverdue: daysBetween(todayD, due),
      })
    } else if (due >= todayD && due <= soonLimit) {
      dueSoon.push({
        studentId: s.id,
        name: s.name,
        dueDate: s.next_payment_due,
        daysUntilDue: daysBetween(due, todayD),
      })
    }
  }

  // Más urgentes primero
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)
  dueSoon.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  return { overdue, dueSoon }
}

// ============================================================
// 2. Sin plan de TRAINING activo
// ------------------------------------------------------------
// Inputs: students con plan_assignments embedded (igual al dashboard)
// ============================================================
export function computeNoActivePlan(students) {
  const out = []
  for (const s of students || []) {
    const a = getActiveTrainingAssignment(s)
    if (!a) {
      out.push({ studentId: s.id, name: s.name })
    }
  }
  return out
}

// ============================================================
// 3. Planes que vencen dentro de N días
// ------------------------------------------------------------
// Considera la asignación de TRAINING activa de cada alumno y mira su
// end_date. Si end_date IS NULL → no aplica (plan abierto).
// ============================================================
export function computePlanExpiringSoon(students, today = new Date()) {
  const todayD = startOfDay(today)
  const soonLimit = addDays(todayD, ALERT_THRESHOLDS.PLAN_EXPIRING_SOON_DAYS)
  const out = []
  for (const s of students || []) {
    const a = getActiveTrainingAssignment(s)
    if (!a) continue
    const ed = parseYMD(a.end_date)
    if (!ed) continue
    if (ed >= todayD && ed <= soonLimit) {
      out.push({
        studentId: s.id,
        name: s.name,
        planTitle: a.plan?.title || 'Plan activo',
        endDate: a.end_date,
        daysUntilEnd: daysBetween(ed, todayD),
      })
    }
  }
  out.sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)
  return out
}

// ============================================================
// 4. Alumnos sin loguear hace N+ días
// ------------------------------------------------------------
// Solo consideramos alumnos con plan de TRAINING activo. Tiene poco
// sentido decir "X no entrenó" si X no tiene plan asignado.
//
// Inputs:
//   students                       activos
//   lastLogDateByStudent           Map<studentId, YMD>  o null si nunca
//                                    (lo arma el hook a partir de
//                                      workout_logs / workout_sessions).
// ============================================================
export function computeInactiveStudents(students, lastLogDateByStudent, today = new Date()) {
  const todayD = startOfDay(today)
  const out = []

  for (const s of students || []) {
    if (!getActiveTrainingAssignment(s)) continue

    const lastYmd = lastLogDateByStudent?.get(s.id) || null
    const lastDate = parseYMD(lastYmd)
    const daysSince = lastDate ? daysBetween(todayD, lastDate) : null

    // Sin logs en absoluto en la ventana → tratamos como "muchos días"
    if (daysSince === null) {
      out.push({
        studentId: s.id,
        name: s.name,
        daysSinceLastLog: Infinity,
        lastLogDate: null,
      })
      continue
    }

    if (daysSince >= ALERT_THRESHOLDS.INACTIVE_DAYS) {
      out.push({
        studentId: s.id,
        name: s.name,
        daysSinceLastLog: daysSince,
        lastLogDate: lastYmd,
      })
    }
  }

  // Más inactivos primero. Infinity (nunca) primero de todos.
  out.sort((a, b) => b.daysSinceLastLog - a.daysSinceLastLog)
  return out
}

// ============================================================
// 5. RPE alto sostenido
// ------------------------------------------------------------
// Alumnos con HIGH_RPE_MIN_OCCURRENCES o más logs con
// perceived_difficulty >= HIGH_RPE_THRESHOLD en los últimos
// HIGH_RPE_WINDOW_DAYS días.
//
// Es señal temprana de sobrecarga → el coach debe revisar cargas.
//
// Inputs:
//   students        activos
//   recentLogs      [{ student_id, logged_date, perceived_difficulty }]
//                     todos los logs en una ventana suficiente; la
//                     función filtra a HIGH_RPE_WINDOW_DAYS internamente.
// ============================================================
export function computeHighRpeStudents(students, recentLogs, today = new Date()) {
  const todayD = startOfDay(today)
  const windowStart = addDays(todayD, -ALERT_THRESHOLDS.HIGH_RPE_WINDOW_DAYS)

  // Contamos por alumno los logs con RPE alto en la ventana.
  const counts = new Map() // studentId → { count, peak, lastDate }
  for (const log of recentLogs || []) {
    const pd = Number(log.perceived_difficulty)
    if (!Number.isFinite(pd)) continue
    if (pd < ALERT_THRESHOLDS.HIGH_RPE_THRESHOLD) continue
    const d = parseYMD(log.logged_date)
    if (!d || d < windowStart || d > todayD) continue

    const sid = log.student_id
    const prev = counts.get(sid) || { count: 0, peak: 0, lastDate: null }
    prev.count += 1
    if (pd > prev.peak) prev.peak = pd
    if (!prev.lastDate || d > parseYMD(prev.lastDate)) {
      prev.lastDate = log.logged_date
    }
    counts.set(sid, prev)
  }

  const out = []
  for (const s of students || []) {
    const stats = counts.get(s.id)
    if (!stats) continue
    if (stats.count < ALERT_THRESHOLDS.HIGH_RPE_MIN_OCCURRENCES) continue
    out.push({
      studentId: s.id,
      name: s.name,
      highRpeCount: stats.count,
      peakRpe: stats.peak,
      lastDate: stats.lastDate,
    })
  }
  out.sort((a, b) => b.highRpeCount - a.highRpeCount || b.peakRpe - a.peakRpe)
  return out
}

// ============================================================
// computeAllAlerts — orquestador
// ============================================================
export function computeAllAlerts({
  students,
  lastLogDateByStudent,
  recentLogs,
  today = new Date(),
}) {
  const { overdue, dueSoon } = computePaymentAlerts(students, today)
  return {
    overdue,
    dueSoon,
    noActivePlan: computeNoActivePlan(students),
    planExpiringSoon: computePlanExpiringSoon(students, today),
    inactiveStudents: computeInactiveStudents(students, lastLogDateByStudent, today),
    highRpeStudents: computeHighRpeStudents(students, recentLogs, today),
  }
}

// ============================================================
// Tokens visuales por tipo de alerta — los consume la UI para evitar
// repetir paletas en cada render.
// ============================================================
export const ALERT_KIND = {
  overdue: {
    key: 'overdue',
    label: 'Pagos vencidos',
    icon: '🔴',
    borderClass: 'border-l-red-400',
    accentClass: 'text-red-600',
  },
  planExpiringSoon: {
    key: 'planExpiringSoon',
    label: 'Planes que vencen pronto',
    icon: '🟠',
    borderClass: 'border-l-orange-400',
    accentClass: 'text-orange-600',
  },
  dueSoon: {
    key: 'dueSoon',
    label: 'Pagos por vencer',
    icon: '🟡',
    borderClass: 'border-l-yellow-400',
    accentClass: 'text-yellow-600',
  },
  inactiveStudents: {
    key: 'inactiveStudents',
    label: 'Sin entrenar hace varios días',
    icon: '😴',
    borderClass: 'border-l-blue-400',
    accentClass: 'text-blue-600',
  },
  highRpeStudents: {
    key: 'highRpeStudents',
    label: 'Esfuerzo alto sostenido',
    icon: '🔥',
    borderClass: 'border-l-purple-400',
    accentClass: 'text-purple-600',
  },
  noActivePlan: {
    key: 'noActivePlan',
    label: 'Sin plan activo',
    icon: '⚪',
    borderClass: 'border-l-gray-300',
    accentClass: 'text-gray-500',
  },
}

// Orden recomendado en la UI (de más urgente a menos).
export const ALERT_RENDER_ORDER = [
  'overdue',
  'planExpiringSoon',
  'dueSoon',
  'inactiveStudents',
  'highRpeStudents',
  'noActivePlan',
]
