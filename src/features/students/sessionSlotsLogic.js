// ============================================================
// Sesiones por día del plan (tabla de progreso, 2026-11-25)
// ------------------------------------------------------------
// Antes las columnas de sesión eran las fechas de TODAS las sesiones de la
// persona. Quien alterna Día A / Día B tenía dato en la mitad de las
// columnas y el resto eran "—": con 3 sesiones, cada ejercicio mostraba
// una sola vez real.
//
// Agrupada por día, cada grupo usa sus propias fechas: las veces que le
// tocó ESE día. Las columnas pasan a ser posiciones ("Última", "Anterior",
// "−2"…) alineadas a la derecha, así la última vez queda siempre en la
// misma columna. La fecha real va dentro de la celda.
// ============================================================

// Fechas (ISO, ascendente) en que la fila tiene algo registrado u omitido.
export function rowSessionDates(row, skippedDates = []) {
  const set = new Set()
  for (const l of row?.recentLogs || []) if (l?.logged_date) set.add(l.logged_date)
  for (const d of skippedDates) if (d) set.add(d)
  return set
}

// Fechas del grupo: unión de las de sus filas, ascendente, las N últimas
// ('all' = todas).
export function groupSessionDates(dateSets, count) {
  const all = new Set()
  for (const s of dateSets) for (const d of s) all.add(d)
  const sorted = [...all].sort()
  if (count === 'all') return sorted
  const n = Number(count)
  return Number.isFinite(n) && n > 0 ? sorted.slice(-n) : sorted
}

// Cantidad de columnas = el grupo con más fechas. Cada grupo se rellena con
// null a la izquierda: la última vez siempre cae en la última columna.
export function alignSlots(groupDates) {
  const slotCount = groupDates.reduce((mx, d) => Math.max(mx, d.length), 0)
  const padded = groupDates.map((d) => [...Array(slotCount - d.length).fill(null), ...d])
  return { slotCount, padded }
}

// Rótulo de la columna i (0 = más vieja) de slotCount.
// Devuelve { key, n } para i18n: last | prev | nth (n sesiones atrás).
export function slotLabel(i, slotCount) {
  const back = slotCount - 1 - i
  if (back === 0) return { key: 'last', n: 0 }
  if (back === 1) return { key: 'prev', n: 1 }
  return { key: 'nth', n: back }
}
