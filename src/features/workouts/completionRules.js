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
// Cierre del día (regla vigente desde 2026-09-28, Franco):
//   algo sin resolver                      → 'open'     (no cierra)
//   todo resuelto y ≥75% de lo esperado hecho → 'complete' (aunque haya omisiones)
//   todo resuelto y menos del 75% hecho    → 'partial'  (cierra igual)
//   todo resuelto pero nada hecho          → 'open'     ("no hice nada" no es sesión)
//   nada resuelto                          → 'none'
// Activación y día se cuentan JUNTOS en el mismo tally, sean cuantos
// sean los bloques. Los estados 'complete' y 'partial' cuentan como
// sesión para la adherencia semanal; 'open' y 'none' no.
//
// Historia: el 2026-09-22 se había decidido contar omisiones (máximo 1 para
// cerrar). Franco lo usó, omitió 2 ejercicios de movilidad y el día le
// quedó abierto; admitió que quiso marcarlos como hechos para cerrarlo.
// Una regla que empuja a mentir rompe el dato que la app existe para
// juntar, así que el día pasó a cerrar siempre que esté todo resuelto, y
// el porcentaje solo separa completo de parcial.
//
// Funciones puras, sin React ni Supabase.
// ============================================================

// Proporción de ítems HECHOS (sobre el total esperado) desde la cual un día
// resuelto cuenta como completo.
export const COMPLETE_THRESHOLD = 0.75

// Todos los motivos válidos en la base (v59). 'choice' ("elegí no hacerlo")
// queda para leer las filas viejas: la pantalla ya no lo ofrece.
export const SKIP_REASONS = ['choice', 'time', 'discomfort', 'unclear', 'other']
// Los que se ofrecen al omitir, en este orden (decisión Franco 2026-09-28:
// pocas opciones; "otro" admite una aclaración corta).
export const SKIP_REASONS_OFFERED = ['time', 'discomfort', 'unclear', 'other']
// "No sabía cómo hacerlo" es una falla del plan, no de la persona: le
// llega a la coach como notificación y como alerta.
export const SKIP_REASON_NEEDS_COACH = 'unclear'
export const SKIP_NOTE_MAX = 280
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
  if (done === 0) return 'open' // todo omitido: no hay sesión que cerrar
  return done / total >= COMPLETE_THRESHOLD ? 'complete' : 'partial'
}

// Un día cerrado (completo o parcial) cuenta como sesión.
export function isDayStateClosed(state) {
  return state === 'complete' || state === 'partial'
}

// ============================================================
// Resumen para las vistas de la coach (etapa 5, 2026-09-26)
// ------------------------------------------------------------
// summarizeEntries(logs): sobre registros de ejercicio y/o de bloque,
// cuántos se omitieron (con apertura por motivo) y, de los hechos que
// declararon cómo se cargaron, cuántos fueron tal cual y cuántos con
// ajustes. Los hechos sin entry_mode (anteriores a v54) no cuentan en
// la proporción: no sabemos cómo se cargaron.
// ============================================================
export const SKIP_REASON_LABEL = {
  choice: 'Eligió no hacerlo',
  time: 'No llegó con el tiempo',
  discomfort: 'Le molestaba algo',
  unclear: 'No sabía cómo hacerlo',
  other: 'Otro motivo',
}
export const SKIP_REASON_SHORT = {
  choice: 'Eligió',
  time: 'Tiempo',
  discomfort: 'Molestia',
  unclear: 'No sabía',
  other: 'Otro',
}

export function summarizeEntries(logs) {
  const out = {
    skipped: 0,
    byReason: { choice: 0, time: 0, discomfort: 0, unclear: 0, other: 0, unknown: 0 },
    confirmed: 0,
    edited: 0,
  }
  for (const l of logs || []) {
    if (isLogSkipped(l)) {
      out.skipped += 1
      if (SKIP_REASONS.includes(l.skip_reason)) out.byReason[l.skip_reason] += 1
      else out.byReason.unknown += 1
    } else if (isLogDone(l)) {
      if (l.entry_mode === 'confirmed') out.confirmed += 1
      else if (l.entry_mode === 'edited') out.edited += 1
    }
  }
  const withMode = out.confirmed + out.edited
  out.withMode = withMode
  out.confirmedPct = withMode > 0 ? Math.round((out.confirmed / withMode) * 100) : null
  return out
}

// "3 omitidos: 2 por tiempo y 1 por molestia"
export function describeSkips(summary) {
  const n = summary?.skipped || 0
  if (n === 0) return ''
  const parts = []
  const by = summary.byReason || {}
  if (by.time) parts.push(`${by.time} por tiempo`)
  if (by.discomfort) parts.push(`${by.discomfort} por molestia`)
  if (by.unclear) parts.push(`${by.unclear} por no saber cómo hacerlo`)
  if (by.other) parts.push(`${by.other} por otro motivo`)
  if (by.choice) parts.push(`${by.choice} por elección`)
  if (by.unknown) parts.push(`${by.unknown} sin motivo`)
  const joined =
    parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`
  return `${n} omitido${n === 1 ? '' : 's'}${joined ? `: ${joined}` : ''}`
}
