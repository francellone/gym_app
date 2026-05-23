// ============================================================
// dayTalliesLogic.js
// ------------------------------------------------------------
// Funciones puras para computar las "tildes por día del plan" (Q2).
//
// Pedido literal de Anto (2026-05-21, doc 13 §Q2):
//   "Día A ✓✓✓ significa que ya lo hizo 3 veces y Día B sólo 2".
//
// Decisión Franco (2026-05-23 noche):
//   - Umbral entero/parcial: 100% estricto. Entero = todos los
//     workout_logs.completed=true para los plan_exercises de ese
//     section en esa fecha. Parcial = >0% pero <100%.
//   - Activación NO genera un día propio (forma parte de cualquier
//     día) — se descarta del agrupado.
//
// computeDayTallies agrupa logs por section y devuelve, por section,
// la cuenta de fechas distintas con entero vs parcial.
// ============================================================

/**
 * @typedef {Object} WorkoutLog
 * @property {string} logged_date     YMD ('2026-05-23' o timestamp ISO)
 * @property {string} plan_exercise_id
 * @property {boolean} completed
 */

/**
 * @typedef {Object} PlanExercise
 * @property {string} id
 * @property {string} section         'activation' | 'day_a' | 'day_b' | 'day_c' | 'day_d'
 */

/**
 * @typedef {Object} SectionTally
 * @property {number} entero          Fechas con 100% de ejercicios completed
 * @property {number} parcial         Fechas con >0% pero <100% completed
 * @property {number} total           entero + parcial
 * @property {Set<string>} days       Fechas YMD que contribuyeron (cualquier estado)
 */

// ============================================================
// computeDayTallies
// ------------------------------------------------------------
// Inputs:
//   logs           WorkoutLog[]   — workout_logs del alumno+plan.
//                                   Sólo se consideran los cuyo
//                                   plan_exercise_id matchea un PE
//                                   del plan con section LIKE 'day_%'.
//   planExercises  PlanExercise[] — plan_exercises del plan target.
//
// Output:
//   Record<section, SectionTally>
//   Ej:
//     {
//       day_a: { entero: 2, parcial: 1, total: 3, days: Set(['...']) },
//       day_b: { entero: 0, parcial: 1, total: 1, days: Set(['...']) }
//     }
// ============================================================
export function computeDayTallies({ logs, planExercises } = {}) {
  // 1) Mapeo exerciseId → section + totales esperados por section.
  //    Sólo nos importa section LIKE 'day_%'. La activación NO cuenta
  //    como día propio: el alumno la hace siempre antes de cualquier
  //    day_X y mezclarla rompería el conteo.
  const exerciseToSection = new Map()
  const sectionTotals = {}

  for (const pe of planExercises || []) {
    if (!pe || typeof pe.section !== 'string' || !pe.section.startsWith('day_')) continue
    exerciseToSection.set(pe.id, pe.section)
    sectionTotals[pe.section] = (sectionTotals[pe.section] || 0) + 1
  }

  // 2) Por (fecha, section), contar cuántos ejercicios completados
  //    tiene el alumno. Sólo logs con completed=true cuentan.
  const completedByDateSection = new Map()

  for (const log of logs || []) {
    if (!log || !log.completed) continue
    const section = exerciseToSection.get(log.plan_exercise_id)
    if (!section) continue
    const date = String(log.logged_date || '').slice(0, 10)
    if (!date) continue
    const key = `${date}__${section}`
    completedByDateSection.set(key, (completedByDateSection.get(key) || 0) + 1)
  }

  // 3) Por (fecha, section): entero si completados >= total esperado,
  //    parcial si 0 < completados < total. Acumular por section.
  const tallies = {}

  for (const [key, completedCount] of completedByDateSection.entries()) {
    const sepIdx = key.indexOf('__')
    const date = key.slice(0, sepIdx)
    const section = key.slice(sepIdx + 2)
    const total = sectionTotals[section] || 0
    if (total === 0) continue

    if (!tallies[section]) {
      tallies[section] = { entero: 0, parcial: 0, total: 0, days: new Set() }
    }
    const t = tallies[section]
    if (completedCount >= total) t.entero += 1
    else if (completedCount > 0) t.parcial += 1
    t.total = t.entero + t.parcial
    t.days.add(date)
  }

  return tallies
}

// ============================================================
// formatTallyForDisplay
// ------------------------------------------------------------
// Convierte un SectionTally en string visual según las reglas
// decididas por Franco (2026-05-23 noche):
//   - total <  5 → tildes "✓✓✓◐" (entero=✓, parcial=◐)
//   - total >= 5 → colapsa a "×N" con sufijo "(M◐)" si parcial>0
//
// Ej:
//   { entero: 3, parcial: 0 } → "✓✓✓"
//   { entero: 2, parcial: 1 } → "✓✓◐"
//   { entero: 0, parcial: 0 } → ""
//   { entero: 6, parcial: 1 } → "×7 (1◐)"
//   { entero: 5, parcial: 0 } → "×5"
// ============================================================
export function formatTallyForDisplay(tally) {
  if (!tally || (tally.entero === 0 && tally.parcial === 0)) return ''
  const total = (tally.entero || 0) + (tally.parcial || 0)
  if (total < 5) {
    return '✓'.repeat(tally.entero) + '◐'.repeat(tally.parcial)
  }
  return tally.parcial > 0 ? `×${total} (${tally.parcial}◐)` : `×${total}`
}
