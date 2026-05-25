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
 * @property {string} [block_id]      uuid del plan_blocks padre. Opcional para
 *                                    compatibilidad legacy; si no viene, se
 *                                    asume que el ejercicio loggea por workout_log
 *                                    (comportamiento previo a v29).
 */

/**
 * @typedef {Object} PlanBlock
 * @property {string} id
 * @property {string} section_id      'activation' | 'day_a' | 'day_b' | ...
 * @property {string} block_type      'strength' | 'aerobic' | 'circuit'
 */

/**
 * @typedef {Object} WorkoutBlockLog
 * @property {string} logged_date
 * @property {string} plan_block_id
 * @property {boolean} completed
 */

/**
 * @typedef {Object} SectionTally
 * @property {number} entero          Fechas con 100% de ítems completed
 * @property {number} parcial         Fechas con >0% pero <100% completed
 * @property {number} total           entero + parcial
 * @property {Set<string>} days       Fechas YMD que contribuyeron (cualquier estado)
 */

// ============================================================
// computeDayTallies
// ------------------------------------------------------------
// Inputs (v29, 2026-05-25):
//   logs           WorkoutLog[]      — workout_logs del alumno+plan.
//   planExercises  PlanExercise[]    — plan_exercises del plan target.
//                                      Si trae `block_id`, junto con `planBlocks`
//                                      permite discriminar por block_type.
//   blockLogs      WorkoutBlockLog[] — (opcional) workout_block_logs.
//   planBlocks     PlanBlock[]       — (opcional) plan_blocks del plan.
//
// Reglas (v29 — Opción B del plan 29):
//   - Para una sección day_X, los "ítems esperados" son:
//       * todos los plan_exercises cuyo block_type === 'strength'
//         (cuentan por ejercicio, vía workout_logs.completed)
//       * cada plan_block aerobic/circuit cuenta como 1 ítem
//         (vía workout_block_logs.completed para ese block_id)
//   - Si planBlocks NO se pasa (caller legacy), se asume que TODOS los
//     plan_exercises son strength y los block_logs no se cuentan.
//     Esto preserva el comportamiento previo para callers que aún
//     no migraron a la firma nueva.
//
// Output:
//   Record<section, SectionTally>
// ============================================================
export function computeDayTallies({ logs, planExercises, blockLogs, planBlocks } = {}) {
  // 1) Mapa block_id → block_type. Vacío si el caller no pasa planBlocks
  //    (modo legacy: todos los plan_exercises se tratan como strength
  //    y los block_logs se ignoran).
  const blockTypeById = new Map()
  const blockToSection = new Map()
  for (const b of planBlocks || []) {
    if (!b || !b.id) continue
    if (b.__virtual) continue // bloques sintéticos no cuentan
    if (b.block_type) blockTypeById.set(b.id, b.block_type)
    if (
      typeof b.section_id === 'string' &&
      b.section_id.startsWith('day_') &&
      b.block_type &&
      b.block_type !== 'strength'
    ) {
      blockToSection.set(b.id, b.section_id)
    }
  }
  const hasBlocksInfo = blockTypeById.size > 0

  // 2) Mapear plan_exercises de bloques strength → exerciseId → section,
  //    e ir acumulando totales por section.
  //    - Modo legacy (sin planBlocks): TODOS los plan_exercises cuentan.
  //    - Modo nuevo: sólo los de bloques strength (los de aerobic/circuit
  //      no loggean por ejercicio, loggean por bloque).
  const exerciseToSection = new Map()
  const sectionTotals = {}

  for (const pe of planExercises || []) {
    if (!pe || typeof pe.section !== 'string' || !pe.section.startsWith('day_')) continue
    if (hasBlocksInfo) {
      const bt = blockTypeById.get(pe.block_id)
      // Si el bloque del PE es strength → cuenta. Si es aerobic/circuit → no.
      // Si block_id no matchea con ningún bloque conocido (dato inconsistente)
      // → lo tratamos como strength para no perder señal silenciosamente.
      if (bt && bt !== 'strength') continue
    }
    exerciseToSection.set(pe.id, pe.section)
    sectionTotals[pe.section] = (sectionTotals[pe.section] || 0) + 1
  }

  // 3) Sumar al denominador los bloques aerobic/circuit (1 por bloque).
  //    Sólo si tenemos planBlocks.
  for (const [, section] of blockToSection.entries()) {
    sectionTotals[section] = (sectionTotals[section] || 0) + 1
  }

  // 4) Numerador parte 1: workout_logs.completed por (date, section).
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

  // 5) Numerador parte 2: workout_block_logs.completed para bloques
  //    aerobic/circuit. Sólo si tenemos planBlocks y blockLogs.
  for (const bl of blockLogs || []) {
    if (!bl || !bl.completed) continue
    const section = blockToSection.get(bl.plan_block_id)
    if (!section) continue
    const date = String(bl.logged_date || '').slice(0, 10)
    if (!date) continue
    const key = `${date}__${section}`
    completedByDateSection.set(key, (completedByDateSection.get(key) || 0) + 1)
  }

  // 6) Por (fecha, section): entero si completados >= total esperado,
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
