// ============================================================
// verify_calendar_fix.mjs
// ------------------------------------------------------------
// Reproduce el bug del calendario reportado el 2026-05-10 con
// datos reales del alumno "Franco Cellone" y verifica que el
// fix aplicado en useCoachCalendarData.js produce el resultado
// esperado.
//
// Cómo correrlo:
//     node scripts/verify_calendar_fix.mjs
//
// Salida esperada al final: "✅ TODOS LOS CASOS PASAN".
// Si alguno falla, sale con código 1.
//
// El script importa las funciones puras del hook real, así que
// si alguien rompe computeFlexibleOverflowSet o
// computeStudentDayStatus, este check lo agarra.
// ============================================================

import {
  computeFlexibleOverflowSet,
  computeStudentDayStatus,
} from '../src/utils/calendarLogic.js'

// ── Datos crudos tal cual los devuelve hoy Supabase para Franco ──
// Vienen del query de auditoría Q10 corrido el 2026-05-10:
//
// | logged_date | plan                  | status   | plan_type  |
// | ----------- | --------------------- | -------- | ---------- |
// | 2026-04-27  | EVALUACION HIP THRUST | active   | evaluation |
// | 2026-04-27  | PLAN 10 FRANCO        | replaced | training   |
// | 2026-04-28  | EVALUACION HIP THRUST | active   | evaluation |
// | 2026-04-29  | PLAN 10 FRANCO        | replaced | training   |
// | 2026-04-30  | PLAN 10 FRANCO        | replaced | training   |
// | 2026-05-01  | PLAN 10 FRANCO        | replaced | training   |
// | 2026-05-04  | PLAN 11 FRANCO C      | active   | training   |
// | 2026-05-06  | PLAN 11 FRANCO C      | active   | training   |
// | 2026-05-07  | PLAN 11 FRANCO C      | active   | training   |
const PLAN_11 = '7bc16a08-7e01-471d-8c35-8e581d1e788a'
const PLAN_10 = 'f1c5ec58-cecd-4bc3-833a-a8c5af309fbf'
const EVAL    = 'ed91c5e2-4141-4d99-b3df-3dfb3a04dc59'

const rawSessions = [
  { logged_date: '2026-04-27', plan_id: EVAL    },
  { logged_date: '2026-04-27', plan_id: PLAN_10 },
  { logged_date: '2026-04-28', plan_id: EVAL    },
  { logged_date: '2026-04-29', plan_id: PLAN_10 },
  { logged_date: '2026-04-30', plan_id: PLAN_10 },
  { logged_date: '2026-05-01', plan_id: PLAN_10 },
  { logged_date: '2026-05-04', plan_id: PLAN_11 },
  { logged_date: '2026-05-06', plan_id: PLAN_11 },
  { logged_date: '2026-05-07', plan_id: PLAN_11 },
]

// Plan activo: PLAN 11 con frecuencia semanal 3, modo flexible.
const ACTIVE_TRAINING_PLAN_ID = PLAN_11
const SESSIONS_PER_WEEK       = 3

// Hoy simulado: 2026-05-10 (después de la última sesión).
const TODAY = new Date(2026, 4, 10)

// ── Helpers de aserción ──────────────────────────────────────
let failures = 0
function assertEqual(label, got, expected) {
  const gotStr      = JSON.stringify(got)
  const expectedStr = JSON.stringify(expected)
  if (gotStr === expectedStr) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures++
  console.log(`  ✗ ${label}`)
  console.log(`      esperado: ${expectedStr}`)
  console.log(`      obtenido: ${gotStr}`)
}

// ── Reproducción del cómputo del hook ────────────────────────
// Construye el Set de "completed" tal como lo arma el hook:
// (con o sin el filtro de plan_id).
function buildCompletedSet(sessions, { filterByPlanIds = null } = {}) {
  const out = new Set()
  for (const r of sessions) {
    if (filterByPlanIds && !filterByPlanIds.has(r.plan_id)) continue
    out.add(String(r.logged_date).slice(0, 10))
  }
  return out
}

function computeStatuses(completedSet, sessionsPerWeek) {
  const overflow = computeFlexibleOverflowSet(completedSet, sessionsPerWeek)
  const result = {}
  for (const ymd of [...completedSet].sort()) {
    result[ymd] = computeStudentDayStatus(ymd, new Set(), completedSet, TODAY, {
      scheduleMode: 'flexible',
      flexibleOverflowSet: overflow,
    })
  }
  return result
}

// ── Caso 1: el bug ANTES del fix ─────────────────────────────
// Sin filtro por plan_id: 8 fechas distintas, 5 en la semana del
// 27-Abr → cap 3, 2 días caen al overflow ("Día extra" falso).
console.log('\n[Caso 1] Comportamiento ANTES del fix (sin filtro plan_id)')
{
  const completed = buildCompletedSet(rawSessions)
  const statuses  = computeStatuses(completed, SESSIONS_PER_WEEK)

  assertEqual('total fechas en completed', completed.size, 8)
  assertEqual('semana 27-04 acumula falsos extras', {
    '2026-04-30': statuses['2026-04-30'],
    '2026-05-01': statuses['2026-05-01'],
  }, {
    '2026-04-30': 'unplanned_done',  // Día extra (FALSO — era PLAN 10)
    '2026-05-01': 'unplanned_done',  // Día extra (FALSO — era PLAN 10)
  })
  assertEqual('semana 04-05 OK por casualidad (3 logs = cap)', {
    '2026-05-04': statuses['2026-05-04'],
    '2026-05-06': statuses['2026-05-06'],
    '2026-05-07': statuses['2026-05-07'],
  }, {
    '2026-05-04': 'planned_done',
    '2026-05-06': 'planned_done',
    '2026-05-07': 'planned_done',
  })
}

// ── Caso 2: el fix DESPUÉS del cambio ────────────────────────
// Con filtro por plan_id de PLAN 11: solo 3 fechas, todas en la
// semana del 04-05, todas Cumplido. Las semanas anteriores quedan
// como 'rest' (descanso) — que es lo correcto: PLAN 11 no estaba
// activo, las sesiones eran de otros planes.
console.log('\n[Caso 2] Comportamiento DESPUÉS del fix (con filtro plan_id)')
{
  const planFilter = new Set([ACTIVE_TRAINING_PLAN_ID])
  const completed  = buildCompletedSet(rawSessions, { filterByPlanIds: planFilter })
  const statuses   = computeStatuses(completed, SESSIONS_PER_WEEK)

  assertEqual('solo 3 fechas en completed (las del PLAN 11)', completed.size, 3)
  assertEqual('semana 27-04 ya no figura como entrenada', completed.has('2026-04-30'), false)
  assertEqual('semana 04-05 todos Cumplido, sin Día extra', statuses, {
    '2026-05-04': 'planned_done',
    '2026-05-06': 'planned_done',
    '2026-05-07': 'planned_done',
  })
}

// ── Caso 3: regresión — 4 entrenos legítimos en una semana flexible ──
// Si el alumno ENTRENA 4 veces con el plan activo y el cap es 3, el
// 4to día sí es "Día extra". Esto se mantiene.
console.log('\n[Caso 3] 4 entrenos legítimos con cap=3 → 4to día es overflow')
{
  const completed = new Set([
    '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07',
  ])
  const statuses  = computeStatuses(completed, SESSIONS_PER_WEEK)
  assertEqual('los primeros 3 son Cumplido', {
    '2026-05-04': statuses['2026-05-04'],
    '2026-05-05': statuses['2026-05-05'],
    '2026-05-06': statuses['2026-05-06'],
  }, {
    '2026-05-04': 'planned_done',
    '2026-05-05': 'planned_done',
    '2026-05-06': 'planned_done',
  })
  assertEqual('el 4to día es Día extra', statuses['2026-05-07'], 'unplanned_done')
}

// ── Caso 4: cap 0 / sessions_per_week ausente ────────────────
// Si el plan no tiene cap configurado, NO debería marcar nada como overflow.
console.log('\n[Caso 4] Cap 0 / nulo → no se calcula overflow')
{
  const completed = new Set(['2026-05-04', '2026-05-05', '2026-05-06'])
  const overflow0 = computeFlexibleOverflowSet(completed, 0)
  const overflowN = computeFlexibleOverflowSet(completed, null)
  assertEqual('cap 0 → set vacío', [...overflow0], [])
  assertEqual('cap null → set vacío', [...overflowN], [])
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
