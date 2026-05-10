// ============================================================
// verify_student_dashboard_fix.mjs
// ------------------------------------------------------------
// Tests de regresión para el fix P1 (StudentDashboard streak +
// heatmap "Esta semana"). Reproducen el bug donde logs de
// evaluaciones contaban como entrenos y verifican que las
// funciones puras de studentDashboardLogic.js producen los
// resultados correctos.
//
// Cómo correrlo:
//     node scripts/verify_student_dashboard_fix.mjs
// ============================================================

import {
  filterTrainingLogs,
  computeStreak,
  computeWeekTrainingDays,
} from '../src/utils/studentDashboardLogic.js'

// ── Helpers de aserción ──────────────────────────────────────
let failures = 0
function assertEqual(label, got, expected) {
  const gotStr      = JSON.stringify(got, jsonReplacer)
  const expectedStr = JSON.stringify(expected, jsonReplacer)
  if (gotStr === expectedStr) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures++
  console.log(`  ✗ ${label}`)
  console.log(`      esperado: ${expectedStr}`)
  console.log(`      obtenido: ${gotStr}`)
}
function jsonReplacer(_, v) {
  return v instanceof Set ? [...v].sort() : v
}

// ── Helpers para construir fixtures ─────────────────────────
const TRAINING = { plan_type: 'training' }
const EVAL     = { plan_type: 'evaluation' }
const NULL_PT  = null  // plan_type ausente (datos viejos)

function log(date, completed, plan = TRAINING) {
  return { logged_date: date, completed, plan }
}

// ============================================================
// Caso 1: Bug original — sin filtrar, evaluaciones inflan streak
// ============================================================
// Alumno entrenó: 2026-05-08, 2026-05-09 (training)
// Alumno hizo evaluación: 2026-05-07 (eval)
// Hoy: 2026-05-10, todavía no entrenó
//
// Sin filtro: streak = 3 (eval 5/7 + training 5/8 y 5/9)
// Con filtro: streak = 2 (sólo los dos entrenos reales)
// ============================================================
console.log('\n[Caso 1] Bug original: evaluación infla el streak')
{
  const today = new Date(2026, 4, 10)  // 2026-05-10
  const rawLogs = [
    log('2026-05-07', true,  EVAL),     // ← evaluación, no debería contar
    log('2026-05-08', true,  TRAINING),
    log('2026-05-09', true,  TRAINING),
  ]

  // ANTES del fix (sin filtrar)
  const streakBuggy = computeStreak(rawLogs, today)
  assertEqual('sin filtro: streak inflado por evaluación', streakBuggy, 3)

  // DESPUÉS del fix
  const filtered  = filterTrainingLogs(rawLogs)
  const streakFix = computeStreak(filtered, today)
  assertEqual('con filtro: streak refleja sólo training', streakFix, 2)
  assertEqual('filterTrainingLogs deja afuera la evaluación',
    filtered.length, 2)
}

// ============================================================
// Caso 2: Heatmap "Esta semana" con evaluaciones mezcladas
// ============================================================
// Tras filtrar, los días marcados como "entrenado" son sólo los
// de training.
console.log('\n[Caso 2] Heatmap: evaluaciones no marcan días como entrenados')
{
  const rawLogs = [
    log('2026-05-04', true,  TRAINING),
    log('2026-05-05', true,  EVAL),       // ← no debe contar
    log('2026-05-06', true,  TRAINING),
    log('2026-05-07', false, TRAINING),   // ← no completed → no cuenta
  ]

  const filtered = filterTrainingLogs(rawLogs)
  const days     = computeWeekTrainingDays(filtered)

  assertEqual('días marcados como entrenados', days, new Set([
    '2026-05-04', '2026-05-06',
  ]))
}

// ============================================================
// Caso 3: Streak sobrevive transición de plan (replaced → active)
// ============================================================
// Decisión de diseño tomada el 2026-05-10:
//   El streak debe contar logs de CUALQUIER plan training.
// Acá simulamos al alumno entrenando con PLAN viejo (replaced) y
// con PLAN nuevo (active) días consecutivos. El streak no se corta.
console.log('\n[Caso 3] Streak sobrevive transición PLAN replaced → active')
{
  const today = new Date(2026, 4, 10)
  const logs = [
    log('2026-05-07', true, TRAINING),   // PLAN viejo (replaced)
    log('2026-05-08', true, TRAINING),   // PLAN viejo (último día)
    log('2026-05-09', true, TRAINING),   // PLAN nuevo (primer día)
    log('2026-05-10', true, TRAINING),   // PLAN nuevo (hoy)
  ]
  const streak = computeStreak(filterTrainingLogs(logs), today)
  assertEqual('streak = 4 a través de la transición', streak, 4)
}

// ============================================================
// Caso 4: Día sin entrenar (no hoy) corta el streak
// ============================================================
console.log('\n[Caso 4] Día perdido (no hoy) corta el streak')
{
  const today = new Date(2026, 4, 10)
  const logs = [
    log('2026-05-07', true, TRAINING),
    // 2026-05-08 sin log → corta acá
    log('2026-05-09', true, TRAINING),
    log('2026-05-10', true, TRAINING),
  ]
  const streak = computeStreak(filterTrainingLogs(logs), today)
  assertEqual('streak sólo cuenta hasta el corte (2 días)', streak, 2)
}

// ============================================================
// Caso 5: Hoy todavía sin entrenar — el streak no se rompe
// ============================================================
// Patrón típico: alumno abre la app por la mañana, todavía no
// entrenó. El streak debe mostrar el del día anterior (1+ días),
// no caer a 0.
console.log('\n[Caso 5] Hoy sin entrenar todavía mantiene el streak')
{
  const today = new Date(2026, 4, 10)
  const logs = [
    log('2026-05-08', true, TRAINING),
    log('2026-05-09', true, TRAINING),
    // 2026-05-10 (hoy) sin log → no rompe
  ]
  const streak = computeStreak(filterTrainingLogs(logs), today)
  assertEqual('streak = 2 aunque hoy aún no entrenó', streak, 2)
}

// ============================================================
// Caso 6: plan_type null → tratado como training (compat)
// ============================================================
// Si por algún motivo el join no devuelve plan_type (datos viejos
// pre-denormalización, o plan eliminado), incluimos el log por
// default. Es coherente con el patrón usado en el resto del code.
console.log('\n[Caso 6] plan_type ausente cuenta como training (compat)')
{
  const logs = [
    log('2026-05-09', true, NULL_PT),
    log('2026-05-10', true, TRAINING),
  ]
  const filtered = filterTrainingLogs(logs)
  assertEqual('logs sin plan_type quedan adentro', filtered.length, 2)
}

// ============================================================
// Caso 7: Cap de 60 días para evitar loops infinitos
// ============================================================
console.log('\n[Caso 7] Streak capeado a 60 días')
{
  const today = new Date(2026, 4, 10)
  const logs = []
  for (let i = 0; i < 100; i++) {
    const d = new Date(2026, 4, 10 - i)
    logs.push({
      logged_date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      completed: true,
      plan: TRAINING,
    })
  }
  const streak = computeStreak(filterTrainingLogs(logs), today)
  // El cap se evalúa después de incrementar el contador; cuando
  // streakCount > 60 el while corta, así que el valor final es 61.
  assertEqual('streak no se dispara al infinito', streak <= 61, true)
  assertEqual('streak alcanza al menos 60', streak >= 60, true)
}

// ── Cierre ───────────────────────────────────────────────────
console.log('')
if (failures === 0) {
  console.log('✅ TODOS LOS CASOS PASAN')
  process.exit(0)
} else {
  console.log(`❌ ${failures} ASERCIÓN(ES) FALLIDA(S)`)
  process.exit(1)
}
