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
  // Inactividad — contada en DÍAS HÁBILES (lun-vie), no corridos.
  // Decisión Franco 16/06: 3 días hábiles sin entrenar; el finde no
  // cuenta, así que el umbral se "estira" naturalmente a ~4-5 corridos
  // cuando el hueco abarca sábado/domingo.
  INACTIVE_DAYS: 3, // sin loguear hace N+ días HÁBILES
  // Baja adherencia semanal (G2 — decisión Anto 13a).
  // adherencia = sesiones completadas en la semana / sessions_per_week.
  LOW_ADHERENCE_PCT: 50, // <= N% dispara la alerta
  // RPE alto sostenido
  HIGH_RPE_THRESHOLD: 8, // PSE >= N considerado alto
  HIGH_RPE_MIN_OCCURRENCES: 3, // al menos N ocurrencias
  HIGH_RPE_WINDOW_DAYS: 14, // dentro de los últimos N días

  // ── G2 (Fase C.5 doc 19) ──
  // Fatiga / recuperación mala: energy_level <= N o muscle_fatigue >= N
  // sostenidos en M+ días dentro de WELLBEING_WINDOW_DAYS.
  LOW_ENERGY_THRESHOLD: 5,
  HIGH_MUSCLE_FATIGUE_THRESHOLD: 7,
  FATIGUE_MIN_DAYS: 3,
  // Baja motivación: stress_level >= N en M+ días, o energy<=4 + stress>=6.
  HIGH_STRESS_THRESHOLD: 7,
  LOW_MOTIVATION_MIN_DAYS: 3,
  // Ventana para las alertas basadas en wellbeing.
  WELLBEING_WINDOW_DAYS: 14,
  // Dolor repetido: keyword search en wellbeing_logs.notes
  PAIN_KEYWORDS: [
    'dolor',
    'molestia',
    'duele',
    'me molesta',
    'sigue molestando',
    'lesion',
    'lesión',
  ],
  PAIN_MIN_MENTIONS: 1, // bajado de 2→1 (decisión Franco 23/05 noche)
  PAIN_WINDOW_DAYS: 21,
  // Estancamiento: sin subir max(actual_weight) en N días.
  STAGNATION_WINDOW_DAYS: 21,
  STAGNATION_MIN_LOGS: 6, // legacy aggregate (kept para compat)
  // Por ejercicio: mínimo de logs para considerar la señal en un ejercicio.
  STAGNATION_PER_EXERCISE_MIN_LOGS: 3,
  // Dolor: muscle_fatigue alto sostenido como señal complementaria.
  MUSCLE_FATIGUE_PAIN_THRESHOLD: 8,
  MUSCLE_FATIGUE_PAIN_MIN_DAYS: 3,
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

// Cantidad de días HÁBILES (lun-vie) estrictamente posteriores a `from`
// y hasta `to` inclusive. Ej: si entrenó el viernes y hoy es lunes,
// el único día hábil del hueco es el lunes → 1. Si hoy es miércoles → 3
// (lun, mar, mié). Sáb y dom no suman. Usado por la alerta de
// inactividad para no penalizar el descanso de fin de semana.
function businessDaysBetween(from, to) {
  const start = startOfDay(from)
  const end = startOfDay(to)
  if (end <= start) return 0
  let count = 0
  const cursor = new Date(start)
  cursor.setDate(cursor.getDate() + 1) // estrictamente posterior a `from`
  while (cursor <= end) {
    const dow = cursor.getDay() // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

// Lunes de la semana que contiene `date` (semana lun-dom).
function startOfWeekMonday(date) {
  const d = startOfDay(date)
  const dow = d.getDay() // 0=dom..6=sáb
  const diff = dow === 0 ? -6 : 1 - dow // retrocede al lunes
  return addDays(d, diff)
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
    // daysSince = corridos (para mostrar "hace N días" al coach).
    // businessDaysSince = hábiles (para el umbral — no penaliza el finde).
    const daysSince = lastDate ? daysBetween(todayD, lastDate) : null
    const businessDaysSince = lastDate ? businessDaysBetween(lastDate, todayD) : null

    // Sin logs en absoluto en la ventana → tratamos como "muchos días"
    if (daysSince === null) {
      out.push({
        studentId: s.id,
        name: s.name,
        daysSinceLastLog: Infinity,
        businessDaysSinceLastLog: Infinity,
        lastLogDate: null,
      })
      continue
    }

    if (businessDaysSince >= ALERT_THRESHOLDS.INACTIVE_DAYS) {
      out.push({
        studentId: s.id,
        name: s.name,
        daysSinceLastLog: daysSince,
        businessDaysSinceLastLog: businessDaysSince,
        lastLogDate: lastYmd,
      })
    }
  }

  // Más inactivos primero. Infinity (nunca) primero de todos.
  out.sort((a, b) => b.daysSinceLastLog - a.daysSinceLastLog)
  return out
}

// ============================================================
// 4.b Baja adherencia semanal (G2 — decisión Anto 13a)
// ------------------------------------------------------------
// Alumnos cuya adherencia de la semana en curso (lun-dom) es <= 50%.
//   adherencia% = sesiones completadas esta semana / sessions_per_week
//
// La forma de los datos la arma el hook (separación pura/efectos,
// igual que lastLogDateByStudent):
//   adherenceByStudent: Map<studentId, { target, completed }>
//     target    = sessions_per_week del plan de training activo (>0)
//     completed = días de entrenamiento completados en la semana
//
// Solo se evalúan alumnos presentes en el Map (= con plan training
// activo y target válido). Sin target no hay denominador → se omite.
// ============================================================
export function computeLowAdherence(students, adherenceByStudent) {
  const out = []
  for (const s of students || []) {
    const row = adherenceByStudent?.get(s.id)
    if (!row) continue
    const target = Number(row.target)
    if (!Number.isFinite(target) || target <= 0) continue
    const completed = Math.max(0, Number(row.completed) || 0)
    const pct = Math.round((completed / target) * 100)
    if (pct <= ALERT_THRESHOLDS.LOW_ADHERENCE_PCT) {
      out.push({
        studentId: s.id,
        name: s.name,
        completed,
        target,
        pct,
      })
    }
  }
  // Peor adherencia primero.
  out.sort((a, b) => a.pct - b.pct)
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
// 6. Fatiga / recuperación mala (G2 doc 19 Fase C.5)
// ------------------------------------------------------------
// Alumnos con wellbeing_logs sostenidamente "malos" en la ventana:
//   - energy_level <= LOW_ENERGY_THRESHOLD en FATIGUE_MIN_DAYS+ días, O
//   - muscle_fatigue >= HIGH_MUSCLE_FATIGUE_THRESHOLD en FATIGUE_MIN_DAYS+ días
//
// Inputs:
//   students         activos
//   wellbeingLogs   [{ user_id, date, energy_level, muscle_fatigue, ... }]
// ============================================================
export function computeFatigueStudents(students, wellbeingLogs, today = new Date()) {
  const todayD = startOfDay(today)
  const windowStart = addDays(todayD, -ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)

  // counts[userId] = { lowEnergy, highFatigue, peak: { lowEnergy, highFatigue } }
  const counts = new Map()
  for (const w of wellbeingLogs || []) {
    const d = parseYMD(w.date)
    if (!d || d < windowStart || d > todayD) continue
    const sid = w.user_id
    const prev = counts.get(sid) || {
      lowEnergyDays: 0,
      highFatigueDays: 0,
      minEnergy: 10,
      maxFatigue: 0,
    }
    if (
      Number(w.energy_level) > 0 &&
      Number(w.energy_level) <= ALERT_THRESHOLDS.LOW_ENERGY_THRESHOLD
    ) {
      prev.lowEnergyDays += 1
      if (Number(w.energy_level) < prev.minEnergy) prev.minEnergy = Number(w.energy_level)
    }
    if (Number(w.muscle_fatigue) >= ALERT_THRESHOLDS.HIGH_MUSCLE_FATIGUE_THRESHOLD) {
      prev.highFatigueDays += 1
      if (Number(w.muscle_fatigue) > prev.maxFatigue) prev.maxFatigue = Number(w.muscle_fatigue)
    }
    counts.set(sid, prev)
  }

  const out = []
  for (const s of students || []) {
    const stats = counts.get(s.id)
    if (!stats) continue
    const triggers = []
    if (stats.lowEnergyDays >= ALERT_THRESHOLDS.FATIGUE_MIN_DAYS) {
      triggers.push(
        `energía ≤${ALERT_THRESHOLDS.LOW_ENERGY_THRESHOLD} en ${stats.lowEnergyDays} días`
      )
    }
    if (stats.highFatigueDays >= ALERT_THRESHOLDS.FATIGUE_MIN_DAYS) {
      triggers.push(
        `fatiga muscular ≥${ALERT_THRESHOLDS.HIGH_MUSCLE_FATIGUE_THRESHOLD} en ${stats.highFatigueDays} días`
      )
    }
    if (triggers.length === 0) continue
    out.push({
      studentId: s.id,
      name: s.name,
      triggers,
      lowEnergyDays: stats.lowEnergyDays,
      highFatigueDays: stats.highFatigueDays,
      minEnergy: stats.minEnergy === 10 ? null : stats.minEnergy,
      maxFatigue: stats.maxFatigue || null,
    })
  }
  out.sort((a, b) => b.lowEnergyDays + b.highFatigueDays - (a.lowEnergyDays + a.highFatigueDays))
  return out
}

// ============================================================
// 7. Baja motivación (G2 doc 19 Fase C.5)
// ------------------------------------------------------------
// Stress sostenido alto, o combinación de stress alto + energía baja.
// Notas: no se hace NLP de las notes (Anto pidió, pero requiere
// keywords validadas y modelo de lenguaje). Versión v1 con señales
// numéricas + flag de keywords desmotivacionales si están presentes.
// ============================================================
const LOW_MOTIVATION_KEYWORDS = [
  'sin ganas',
  'desmotivad',
  'no tengo ganas',
  'cansad',
  'aburrid',
  'no aguanto',
]

export function computeLowMotivationStudents(students, wellbeingLogs, today = new Date()) {
  const todayD = startOfDay(today)
  const windowStart = addDays(todayD, -ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)

  const counts = new Map()
  for (const w of wellbeingLogs || []) {
    const d = parseYMD(w.date)
    if (!d || d < windowStart || d > todayD) continue
    const sid = w.user_id
    const prev = counts.get(sid) || { stressDays: 0, comboDays: 0, keywordHits: 0 }
    const stress = Number(w.stress_level)
    const energy = Number(w.energy_level)
    if (stress >= ALERT_THRESHOLDS.HIGH_STRESS_THRESHOLD) prev.stressDays += 1
    if (stress >= 6 && energy > 0 && energy <= 4) prev.comboDays += 1
    if (w.notes && typeof w.notes === 'string') {
      const lower = w.notes.toLowerCase()
      if (LOW_MOTIVATION_KEYWORDS.some((k) => lower.includes(k))) prev.keywordHits += 1
    }
    counts.set(sid, prev)
  }

  const out = []
  for (const s of students || []) {
    const stats = counts.get(s.id)
    if (!stats) continue
    const triggers = []
    if (stats.stressDays >= ALERT_THRESHOLDS.LOW_MOTIVATION_MIN_DAYS) {
      triggers.push(`estrés ≥${ALERT_THRESHOLDS.HIGH_STRESS_THRESHOLD} en ${stats.stressDays} días`)
    }
    if (stats.comboDays >= ALERT_THRESHOLDS.LOW_MOTIVATION_MIN_DAYS) {
      triggers.push(`estrés alto + energía baja en ${stats.comboDays} días`)
    }
    if (stats.keywordHits > 0) {
      triggers.push(
        `${stats.keywordHits} mención${stats.keywordHits === 1 ? '' : 'es'} desmotivacional${stats.keywordHits === 1 ? '' : 'es'} en notas`
      )
    }
    if (triggers.length === 0) continue
    out.push({
      studentId: s.id,
      name: s.name,
      triggers,
      stressDays: stats.stressDays,
      comboDays: stats.comboDays,
      keywordHits: stats.keywordHits,
    })
  }
  out.sort((a, b) => b.stressDays + b.comboDays - (a.stressDays + a.comboDays))
  return out
}

// ============================================================
// 8. Dolor repetido (G2 doc 19 Fase C.5)
// ------------------------------------------------------------
// Búsqueda de keywords de dolor en wellbeing_logs.notes en la
// ventana PAIN_WINDOW_DAYS. Si aparecen >= PAIN_MIN_MENTIONS, alerta.
//
// LIMITACIÓN: sin tabla específica de dolor por zona corporal, esto
// es approximation por keyword. Documentado en doc 19. Cuando exista
// pain_logs o un campo estructurado, reemplazar esta función.
// ============================================================
export function computePainStudents(students, wellbeingLogs, today = new Date()) {
  const todayD = startOfDay(today)
  const windowStart = addDays(todayD, -ALERT_THRESHOLDS.PAIN_WINDOW_DAYS)
  const fatigueWindowStart = addDays(todayD, -ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)
  const keywords = ALERT_THRESHOLDS.PAIN_KEYWORDS

  // hits[userId] = { kwCount, kwLastDate, kwLastSnippet, fatigueDays, fatigueMax }
  const hits = new Map()

  for (const w of wellbeingLogs || []) {
    const d = parseYMD(w.date)
    if (!d) continue

    const sid = w.user_id
    const prev = hits.get(sid) || {
      kwCount: 0,
      kwLastDate: null,
      kwLastSnippet: '',
      fatigueDays: 0,
      fatigueMax: 0,
    }

    // Keyword search en notas (ventana PAIN_WINDOW_DAYS).
    if (d >= windowStart && d <= todayD && typeof w.notes === 'string' && w.notes.length > 0) {
      const lower = w.notes.toLowerCase()
      if (keywords.some((k) => lower.includes(k))) {
        prev.kwCount += 1
        if (!prev.kwLastDate || d > parseYMD(prev.kwLastDate)) {
          prev.kwLastDate = w.date
          prev.kwLastSnippet = w.notes.slice(0, 80)
        }
      }
    }

    // Muscle fatigue alto sostenido (ventana WELLBEING_WINDOW_DAYS).
    if (d >= fatigueWindowStart && d <= todayD) {
      const mf = Number(w.muscle_fatigue)
      if (Number.isFinite(mf) && mf >= ALERT_THRESHOLDS.MUSCLE_FATIGUE_PAIN_THRESHOLD) {
        prev.fatigueDays += 1
        if (mf > prev.fatigueMax) prev.fatigueMax = mf
      }
    }

    hits.set(sid, prev)
  }

  const out = []
  for (const s of students || []) {
    const stats = hits.get(s.id)
    if (!stats) continue
    const triggers = []
    if (stats.kwCount >= ALERT_THRESHOLDS.PAIN_MIN_MENTIONS) {
      triggers.push(`${stats.kwCount} mención${stats.kwCount === 1 ? '' : 'es'} en notas`)
    }
    if (stats.fatigueDays >= ALERT_THRESHOLDS.MUSCLE_FATIGUE_PAIN_MIN_DAYS) {
      triggers.push(
        `fatiga muscular ≥${ALERT_THRESHOLDS.MUSCLE_FATIGUE_PAIN_THRESHOLD} en ${stats.fatigueDays} días`
      )
    }
    if (triggers.length === 0) continue
    out.push({
      studentId: s.id,
      name: s.name,
      mentions: stats.kwCount,
      lastDate: stats.kwLastDate,
      lastNoteSnippet: stats.kwLastSnippet,
      fatigueDays: stats.fatigueDays,
      fatigueMax: stats.fatigueMax || null,
      triggers,
    })
  }
  out.sort(
    (a, b) => b.mentions + b.fatigueDays - (a.mentions + a.fatigueDays) || b.mentions - a.mentions
  )
  return out
}

// ============================================================
// 9. Estancamiento POR EJERCICIO (G2 doc 19 Fase C.5 — refactor 2026-05-23)
// ------------------------------------------------------------
// Versión por ejercicio: en lugar de aggregate por alumno, mira
// cada (student, exercise) y compara max(actual_weight) de la primera
// mitad vs segunda mitad de la ventana STAGNATION_WINDOW_DAYS.
//
// Un ejercicio queda flaggeado como estancado si:
//   - tiene al menos STAGNATION_PER_EXERCISE_MIN_LOGS logs en la ventana
//   - max(actual_weight) primera mitad > 0
//   - max(actual_weight) segunda mitad > 0
//   - segunda <= primera (no subió)
//
// Un alumno aparece en la alerta si tiene >= 1 ejercicio estancado.
// El subtítulo lista los ejercicios concretos (matchea mockup G2:
// "Sentadilla sin mejoras hace 3 semanas").
//
// Inputs:
//   students    activos
//   recentLogs  [{ student_id, logged_date, actual_weight, plan_exercise_id,
//                  plan_exercise: { exercise: { id, name } } }]
// ============================================================
export function computeStagnationByExercise(students, recentLogs, today = new Date()) {
  const todayD = startOfDay(today)
  const windowStart = addDays(todayD, -ALERT_THRESHOLDS.STAGNATION_WINDOW_DAYS)
  const halfMs = (todayD.getTime() - windowStart.getTime()) / 2
  const midpoint = new Date(windowStart.getTime() + halfMs)

  // (student, exercise) → { firstMax, secondMax, count, exerciseName }
  const buckets = new Map()
  for (const log of recentLogs || []) {
    const d = parseYMD(log.logged_date)
    if (!d || d < windowStart || d > todayD) continue
    const w = Number(log.actual_weight)
    if (!Number.isFinite(w) || w <= 0) continue
    const exId = log.plan_exercise?.exercise?.id
    const exName = log.plan_exercise?.exercise?.name
    if (!exId) continue

    const key = `${log.student_id}__${exId}`
    const prev = buckets.get(key) || {
      firstMax: 0,
      secondMax: 0,
      count: 0,
      exerciseName: exName || 'Ejercicio sin nombre',
      studentId: log.student_id,
      exerciseId: exId,
    }
    prev.count += 1
    if (d < midpoint) {
      if (w > prev.firstMax) prev.firstMax = w
    } else {
      if (w > prev.secondMax) prev.secondMax = w
    }
    buckets.set(key, prev)
  }

  // Acumular ejercicios estancados por alumno.
  const studentStagnant = new Map() // studentId → stagnant exercises[]
  for (const [, stats] of buckets) {
    if (stats.count < ALERT_THRESHOLDS.STAGNATION_PER_EXERCISE_MIN_LOGS) continue
    if (stats.firstMax === 0 || stats.secondMax === 0) continue
    if (stats.secondMax > stats.firstMax) continue
    const list = studentStagnant.get(stats.studentId) || []
    list.push({
      exerciseId: stats.exerciseId,
      exerciseName: stats.exerciseName,
      firstMax: stats.firstMax,
      secondMax: stats.secondMax,
      logsCount: stats.count,
    })
    studentStagnant.set(stats.studentId, list)
  }

  const out = []
  for (const s of students || []) {
    const stagnant = studentStagnant.get(s.id)
    if (!stagnant || stagnant.length === 0) continue
    // Orden interno: más logs (más señal) primero.
    stagnant.sort((a, b) => b.logsCount - a.logsCount)
    out.push({
      studentId: s.id,
      name: s.name,
      stagnantExercises: stagnant,
      count: stagnant.length,
    })
  }
  out.sort((a, b) => b.count - a.count)
  return out
}

// ============================================================
// computeAllAlerts — orquestador
// ============================================================
export function computeAllAlerts({
  students,
  lastLogDateByStudent,
  adherenceByStudent,
  recentLogs,
  wellbeingLogs = [],
  today = new Date(),
}) {
  const { overdue, dueSoon } = computePaymentAlerts(students, today)
  return {
    overdue,
    dueSoon,
    lowAdherence: computeLowAdherence(students, adherenceByStudent),
    noActivePlan: computeNoActivePlan(students),
    planExpiringSoon: computePlanExpiringSoon(students, today),
    inactiveStudents: computeInactiveStudents(students, lastLogDateByStudent, today),
    highRpeStudents: computeHighRpeStudents(students, recentLogs, today),
    fatigueStudents: computeFatigueStudents(students, wellbeingLogs, today),
    lowMotivationStudents: computeLowMotivationStudents(students, wellbeingLogs, today),
    painStudents: computePainStudents(students, wellbeingLogs, today),
    stagnationStudents: computeStagnationByExercise(students, recentLogs, today),
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
  lowAdherence: {
    key: 'lowAdherence',
    label: 'Baja adherencia semanal',
    icon: '📉',
    borderClass: 'border-l-rose-400',
    accentClass: 'text-rose-600',
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
  fatigueStudents: {
    key: 'fatigueStudents',
    label: 'Fatiga / recuperación mala',
    icon: '😪',
    borderClass: 'border-l-indigo-400',
    accentClass: 'text-indigo-600',
  },
  lowMotivationStudents: {
    key: 'lowMotivationStudents',
    label: 'Baja motivación',
    icon: '😞',
    borderClass: 'border-l-pink-400',
    accentClass: 'text-pink-600',
  },
  painStudents: {
    key: 'painStudents',
    label: 'Dolor repetido',
    icon: '🤕',
    borderClass: 'border-l-amber-400',
    accentClass: 'text-amber-600',
  },
  stagnationStudents: {
    key: 'stagnationStudents',
    label: 'Estancamiento',
    icon: '📉',
    borderClass: 'border-l-slate-400',
    accentClass: 'text-slate-600',
  },
}

// Orden recomendado en la UI (de más urgente a menos).
export const ALERT_RENDER_ORDER = [
  'overdue',
  'lowAdherence', // baja adherencia — accionable, pedido explícito de Anto
  'painStudents', // dolor — atender rápido por riesgo de lesión
  'fatigueStudents', // fatiga — ajustar carga
  'planExpiringSoon',
  'dueSoon',
  'inactiveStudents',
  'lowMotivationStudents',
  'stagnationStudents',
  'highRpeStudents',
  'noActivePlan',
]
