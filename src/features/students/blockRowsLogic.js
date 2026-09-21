// ============================================================
// Filas de bloque (aeróbico / circuito) para la tabla de progreso — v53
// ------------------------------------------------------------
// Los bloques aeróbicos y de circuito no registran por ejercicio
// (workout_logs) sino por bloque (workout_block_logs: minutos, rondas, PSE).
// Hasta v53 ninguna pantalla del coach los leía. Acá vive la lógica pura
// para convertirlos en filas con la MISMA forma que las de ejercicio, así
// StudentProgressTableView las intercala en su sección sin caminos aparte.
// ============================================================

import { computeProgression } from '@/features/progress/progression'
import {
  AEROBIC_FORMATS,
  AEROBIC_ZONES,
  CIRCUIT_TYPES,
  INTENSITY_LEVELS,
  blockTypeLabel,
} from '@/features/plans/helpers'

const labelOf = (list, key) => list.find((x) => x.key === key)?.label || null

// ── Prescripción ─────────────────────────────────────────────
// "Z2 · 30 min · Continuo" / "AMRAP · 4 rondas · 12 min · Intenso"
export function blockPrescriptionSummary(block) {
  if (!block) return ''
  const parts = []
  if (block.block_type === 'aerobic') {
    if (block.aerobic_zone) parts.push(block.aerobic_zone)
    if (block.aerobic_total_minutes) parts.push(`${block.aerobic_total_minutes} min`)
    const fmt = labelOf(AEROBIC_FORMATS, block.aerobic_format)
    if (fmt) parts.push(fmt)
    if (block.aerobic_format === 'intervals' && block.aerobic_rounds)
      parts.push(`${block.aerobic_rounds} rondas`)
    if (block.aerobic_work_seconds && block.aerobic_rest_seconds)
      parts.push(`${block.aerobic_work_seconds}"/${block.aerobic_rest_seconds}"`)
  } else if (block.block_type === 'circuit') {
    const type = labelOf(CIRCUIT_TYPES, block.circuit_type)
    if (type) parts.push(type)
    if (block.circuit_rounds) parts.push(`${block.circuit_rounds} rondas`)
    if (block.circuit_total_minutes) parts.push(`${block.circuit_total_minutes} min`)
    if (block.circuit_work_seconds && block.circuit_rest_seconds)
      parts.push(`${block.circuit_work_seconds}"/${block.circuit_rest_seconds}"`)
    const int = labelOf(INTENSITY_LEVELS, block.circuit_intensity)
    if (int) parts.push(int)
  }
  return parts.join(' · ')
}

// Minutos prescriptos (o null) y rondas prescriptas (o null)
export function blockPrescribedMinutes(block) {
  if (!block) return null
  return block.block_type === 'aerobic'
    ? (block.aerobic_total_minutes ?? null)
    : (block.circuit_total_minutes ?? null)
}
export function blockPrescribedRounds(block) {
  if (!block) return null
  return block.block_type === 'aerobic'
    ? block.aerobic_format === 'intervals'
      ? (block.aerobic_rounds ?? null)
      : null
    : (block.circuit_rounds ?? null)
}

export function blockPrescribedZoneOrIntensity(block) {
  if (!block) return null
  if (block.block_type === 'aerobic') {
    const z = AEROBIC_ZONES.find((x) => x.key === block.aerobic_zone)
    return z ? `${z.key} · ${z.short}` : labelOf(INTENSITY_LEVELS, block.aerobic_intensity)
  }
  return labelOf(INTENSITY_LEVELS, block.circuit_intensity)
}

// ── Nombre de la fila ────────────────────────────────────────
// Título del bloque si la coach lo puso; si no, "Aeróbico · Bici" o "Circuito".
export function blockRowName(block, exerciseName = null) {
  if (!block) return 'Bloque'
  const type = blockTypeLabel(block.block_type)
  if (block.title) return block.title
  return exerciseName ? `${type} · ${exerciseName}` : type
}

// ── Lo registrado ────────────────────────────────────────────
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

export function blockLogMinutes(log) {
  return num(log?.actual_minutes)
}
export function blockLogRounds(log) {
  return num(log?.actual_rounds)
}

// Métrica principal para progresión y tendencia: minutos si los hay,
// si no rondas (AMRAP sin tiempo fijo).
export function blockMetricOf(log) {
  return blockLogMinutes(log) ?? blockLogRounds(log) ?? 0
}

// "30 min" / "4 rondas" / "12 min · 4 rondas" / "—"
export function displayBlockLogMain(log) {
  const m = blockLogMinutes(log)
  const r = blockLogRounds(log)
  const parts = []
  if (m != null) parts.push(`${m} min`)
  if (r != null) parts.push(`${r} rondas`)
  return parts.length ? parts.join(' · ') : '—'
}

// ── Fila con la misma forma que buildRow() de la tabla ───────
// block: plan_blocks (con block_type, section, order_index, prescripción)
// blockLogs: workout_block_logs de ESE bloque (cualquier orden)
export function buildBlockRow(block, blockLogs = [], overrides = {}) {
  const sorted = [...blockLogs].sort((a, b) =>
    (a.logged_date || '').localeCompare(b.logged_date || '')
  )
  const lastLog = sorted.length > 0 ? sorted[sorted.length - 1] : null
  const prevLog = sorted.length > 1 ? sorted[sorted.length - 2] : null

  const lastM = lastLog ? blockMetricOf(lastLog) : 0
  const prevM = prevLog ? blockMetricOf(prevLog) : 0
  let trend = '—'
  if (lastLog && prevLog && prevM > 0) {
    trend = lastM > prevM ? '↑' : lastM < prevM ? '↓' : '='
  } else if (lastLog && !prevLog) {
    trend = '·'
  }

  const pseVals = sorted.map((l) => l.perceived_difficulty).filter((v) => v != null)
  const avgPse =
    pseVals.length > 0
      ? Math.round((pseVals.reduce((a, b) => a + b, 0) / pseVals.length) * 10) / 10
      : null

  const minutePts = sorted
    .map((l) => ({ date: l.logged_date, value: blockLogMinutes(l) }))
    .filter((p) => p.value != null && p.value > 0)
  let progressMetric = 'Min'
  let prog = computeProgression(minutePts)
  if (!prog) {
    prog = computeProgression(
      sorted
        .map((l) => ({ date: l.logged_date, value: blockLogRounds(l) }))
        .filter((p) => p.value != null && p.value > 0)
    )
    if (prog) progressMetric = 'Rondas'
  }
  const progressPct = prog ? prog.pct : null
  const progressColor = !prog
    ? 'text-gray-400'
    : prog.pct > 0
      ? 'text-green-600'
      : prog.pct < 0
        ? 'text-red-500'
        : 'text-gray-500'

  const sparklineValues =
    minutePts.length >= 2
      ? minutePts.map((p) => p.value)
      : sorted.map(blockLogRounds).filter((r) => r != null && r > 0)

  const maxMinutes = minutePts.reduce((mx, p) => Math.max(mx, p.value), 0)
  const totalMinutes = minutePts.reduce((a, p) => a + p.value, 0)

  const exerciseName =
    overrides.exerciseName ??
    (sorted.find((l) => l.exercise?.name)?.exercise?.name || block.exerciseName || null)

  return {
    kind: 'block',
    blockType: block.block_type,
    id: `blk-${block.id}`,
    blockId: block.id,
    exerciseId: block.exerciseId || sorted.find((l) => l.exercise_id)?.exercise_id || null,
    planId: block.plan_id,
    section: block.section,
    blockOrder: block.order_index ?? 0,
    block_label: '',
    exerciseName: blockRowName(block, exerciseName),
    muscleGroup: blockPrescriptionSummary(block),
    suggested_sets: blockPrescribedRounds(block),
    suggested_reps: null,
    suggested_weightStr: blockPrescribedMinutes(block)
      ? `${blockPrescribedMinutes(block)} min`
      : '—',
    suggested_pse: blockPrescribedZoneOrIntensity(block),
    recentLogs: [...sorted].reverse(),
    sparklineValues,
    maxWeight: null,
    maxMinutes: maxMinutes > 0 ? maxMinutes : null,
    trend,
    count: sorted.length,
    volume: Math.round(totalMinutes),
    avgPse,
    progressPct,
    progressColor,
    progressMetric,
    hasLogs: sorted.length > 0,
    ...overrides,
  }
}

// ── Orden dentro de una sección ──────────────────────────────
// Las filas de ejercicio traen blockOrder del bloque de fuerza al que
// pertenecen (plan_exercises.block_id → plan_blocks.order_index); las de
// bloque traen el suyo. Se ordena por bloque y, dentro, se respeta el orden
// de llegada (order_index del ejercicio). Sin block_id (planes viejos) → -1,
// quedan primero como hasta ahora.
export function sortRowsInSection(rows) {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const oa = a.r.blockOrder ?? -1
      const ob = b.r.blockOrder ?? -1
      if (oa !== ob) return oa - ob
      return a.i - b.i
    })
    .map((x) => x.r)
}

// ── Filtro por tipo ──────────────────────────────────────────
export const ROW_TYPE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'strength', label: 'Fuerza' },
  { id: 'aerobic', label: 'Aeróbico' },
  { id: 'circuit', label: 'Circuito' },
]

export function rowMatchesType(row, typeFilter) {
  if (!typeFilter || typeFilter === 'all') return true
  const t = row.kind === 'block' ? row.blockType : row.blockType || 'strength'
  return t === typeFilter
}
