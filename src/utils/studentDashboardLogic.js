// ============================================================
// studentDashboardLogic.js
// ------------------------------------------------------------
// Funciones puras del dashboard del alumno (StudentDashboard.jsx):
//   - filterTrainingLogs       → excluye logs de evaluaciones
//   - computeStreak            → cuenta días consecutivos entrenados
//   - computeWeekTrainingDays  → Set de fechas entrenadas en la semana
//
// Igual que calendarLogic.js: están separadas para poder importarse
// en scripts standalone sin React ni Supabase.
//
// REGLA DE NEGOCIO (decidida con el coach el 2026-05-10):
//   El streak y la heatmap deben contar logs de CUALQUIER plan de
//   training, incluyendo planes 'replaced'. Esto asegura que las
//   transiciones de plan (PLAN N → N+1) no rompan el streak.
//   Las evaluaciones NUNCA cuentan: son tests puntuales, no
//   sesiones de entrenamiento.
// ============================================================

// ── Date utils internas ──────────────────────────────────────
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

function addDays(date, n) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + n)
  return d
}

// ============================================================
// filterTrainingLogs
// ------------------------------------------------------------
// Inputs:
//   logs  [{ logged_date, completed, plan: { plan_type } | null }]
//
// Output: subset cuyos logs vienen de un plan training.
//
// Reglas:
//   - plan.plan_type === 'training'  → incluir
//   - plan.plan_type === 'evaluation' → excluir
//   - plan_type ausente / plan null  → incluir (default training,
//                                       compatibilidad con datos
//                                       viejos sin denormalizar)
// ============================================================
export function filterTrainingLogs(logs) {
  return (logs || []).filter(l => {
    const pt = l?.plan?.plan_type
    return !pt || pt === 'training'
  })
}

// ============================================================
// computeStreak
// ------------------------------------------------------------
// Cuenta días consecutivos entrenados retrocediendo desde `today`.
// Hoy puede no contar todavía (el alumno no entrenó aún) sin
// romper el streak. Cualquier otro día sin log corta.
//
// Inputs:
//   logs   [{ logged_date, completed }]  — ya filtrados a training
//   today  Date — referencia de "hoy"
//
// Output:
//   number  cantidad de días consecutivos. Capeado a 60 para evitar
//           loops largos en datos pre-existentes.
// ============================================================
export function computeStreak(logs, today = new Date()) {
  const completedDates = new Set(
    (logs || [])
      .filter(l => l.completed)
      .map(l => String(l.logged_date).slice(0, 10))
  )

  const todayD = startOfDay(today)
  const todayYMD = toYMD(todayD)

  let streakCount = 0
  let cursor = todayD
  while (true) {
    const ymd = toYMD(cursor)
    const hasLog = completedDates.has(ymd)
    // Hoy: si todavía no entrenó, no rompemos streak (puede entrenar
    // más tarde). Pero si tampoco lo entrenó cualquier otro día, corta.
    if (!hasLog && ymd !== todayYMD) break
    if (hasLog) streakCount++
    cursor = addDays(cursor, -1)
    if (streakCount > 60) break
  }
  return streakCount
}

// ============================================================
// computeWeekTrainingDays
// ------------------------------------------------------------
// Devuelve Set<YMD> con las fechas en las que el alumno entrenó
// (al menos un log con completed=true). Usado para colorear la
// heatmap "Esta semana".
//
// Inputs:
//   logs  [{ logged_date, completed }]  — ya filtrados a training
//
// Output:
//   Set<string YMD>
// ============================================================
export function computeWeekTrainingDays(logs) {
  const out = new Set()
  for (const l of logs || []) {
    if (!l.completed) continue
    out.add(String(l.logged_date).slice(0, 10))
  }
  return out
}
