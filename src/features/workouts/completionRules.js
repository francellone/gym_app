// ============================================================
// completionRules.js — qué es "hecho", "omitido", "resuelto" y cómo cierra un día
// ------------------------------------------------------------
// ÚNICA fuente de verdad de la regla de cierre (v54, 2026-09-22). Todo lo
// que decida si un ejercicio cuenta, si un día cierra o si una fecha es
// "entrenó ese día" pasa por acá. Antes la regla estaba repartida en
// helpers.isBlockCompleted, sessionProgress y dayTalliesLogic y era
// binaria: completed o nada.
//
// Con v54 un registro puede ser:
//   hecho     status='done'    y completed=true   (lo hizo, tal cual o ajustado)
//   omitido   status='skipped' y completed=false  (declaró que no lo hizo)
//   ninguno   no hay registro
//
// "Resuelto" = hecho u omitido: la persona se pronunció sobre el ítem.
//
// Cierre del día, decidido con Franco el 2026-09-22 CONTANDO omisiones
// (no por porcentaje: ocho de cada diez días del plan tienen 4 o 5
// unidades, así que un umbral porcentual se comporta como "cero
// omisiones"):
//   0 omisiones y todo hecho      → 'complete'  (día completo)
//   1 omisión y todo resuelto     → 'partial'   (cierra igual, "4 de 5")
//   2+ omisiones, o algo sin resolver → 'open'  (no cierra)
//   nada resuelto                 → 'none'
// Y un día cerrado necesita AL MENOS UN hecho: un día de un solo ejercicio
// omitido tiene una omisión, pero "no hice nada" no es una sesión.
// Los estados 'complete' y 'partial' cuentan como sesión para la
// adherencia semanal; 'open' y 'none' no.
//
// Funciones puras, sin React ni Supabase.
// ============================================================

export const MAX_OMISSIONS_TO_CLOSE = 1

export const SKIP_REASONS = ['choice', 'time', 'discomfort']
export const ENTRY_MODES = ['confirmed', 'edited']

// Un registro declarado como "no lo hice".
export function isLogSkipped(log) {
  return !!log && log.status === 'skipped'
}

// Un registro hecho de verdad. Se exige status distinto de skipped además
// de completed por defensa: la base lo garantiza con un CHECK, pero el
// estado local del front puede tener una fila a medio actualizar.
export function isLogDone(log) {
  return !!log && !!log.completed && !isLogSkipped(log)
}

// La persona se pronunció: lo hizo o dijo que no lo hizo.
export function isLogResolved(log) {
  return isLogDone(log) || isLogSkipped(log)
}

// ¿Este registro cuenta como actividad (para "entrenó ese día")?
// Una omisión declarada NO es actividad.
export function isTrainingActivity(log) {
  return !!log && !isLogSkipped(log)
}

// Cuenta hechos / omitidos / resueltos sobre una lista de registros
// (o undefined donde no hay registro). `total` es la cantidad de ítems
// esperados, que puede ser mayor que la lista si faltan registros.
export function tallyResolution(logs, total) {
  let done = 0
  let skipped = 0
  for (const log of logs || []) {
    if (isLogDone(log)) done += 1
    else if (isLogSkipped(log)) skipped += 1
  }
  const n = Number.isFinite(total) ? total : (logs || []).length
  return { total: n, done, skipped, resolved: done + skipped }
}

// Suma varios tallies (activación + día, o varios bloques).
export function mergeTallies(...tallies) {
  const out = { total: 0, done: 0, skipped: 0, resolved: 0 }
  for (const t of tallies) {
    if (!t) continue
    out.total += t.total || 0
    out.done += t.done || 0
    out.skipped += t.skipped || 0
  }
  out.resolved = out.done + out.skipped
  return out
}

// Estado del día a partir de su tally. Ver tabla en la cabecera.
// @returns 'none' | 'open' | 'partial' | 'complete'
export function dayStateFromTally(tally) {
  const total = tally?.total || 0
  const done = tally?.done || 0
  const skipped = tally?.skipped || 0
  const resolved = done + skipped
  if (total === 0 || resolved === 0) return 'none'
  if (resolved < total) return 'open'
  if (skipped > MAX_OMISSIONS_TO_CLOSE) return 'open'
  if (done === 0) return 'open' // todo omitido: no hay sesión que cerrar
  return skipped === 0 ? 'complete' : 'partial'
}

// Un día cerrado (completo o parcial) cuenta como sesión.
export function isDayStateClosed(state) {
  return state === 'complete' || state === 'partial'
}
