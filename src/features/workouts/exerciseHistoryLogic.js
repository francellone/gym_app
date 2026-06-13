// ============================================================
// exerciseHistoryLogic — Q1 helpers para "Última vez" + chat del ejercicio
// ------------------------------------------------------------
// Funciones puras (testeables sin React ni Supabase) que reducen
// los datasets brutos de `workout_logs`, `workout_block_logs` y
// `notes` a los lookups que necesita el flow workout para
// renderizar:
//   - "Última vez (fecha): peso/reps/PSE/min/rondas" en el header
//   - "Última nota del coach" en el body expandido
//   - Badge 💬N en el header (cantidad de mensajes en el thread del ejercicio)
//   - Drawer "Ver chat completo" filtrado por exercise_id
//
// Decisión Franco 2026-05-23 late night:
//   - Último log por **exercise_id global** (no por plan_exercise_id).
//     Mismo ejercicio en Día A vs Día B comparte su "última vez".
//     doc 49: ahora también CROSS-PLAN — el ejercicio arrastra su última
//     vez de planes anteriores (mismo exercise_id de catálogo). El caller
//     embebe exercise_id vía join y el reductor lo prioriza sobre el mapa
//     del plan activo.
//   - Última nota = **coach only**.
//   - Chat completo = ambos lados (coach + student).
//   - Scope: strength + aerobic + circuit (cualquier card que tenga
//     un exercise_id asociable).
// ============================================================

import { differenceInCalendarDays, parseISO } from 'date-fns'
// i18n (doc 46): instancia global. Con lng 'es' (default y tests) los outputs
// son idénticos a los strings históricos, así los tests existentes no cambian.
import i18n from '@/i18n'

// ============================================================
// pickLastLogPerExercise
// ------------------------------------------------------------
// Devuelve Map<exercise_id, log> con el log MÁS reciente
// para cada ejercicio.
//
// Inputs:
//   logs           Array<workout_log> — no asume orden previo
//   planExercises  Array<plan_exercise> con (id, exercise_id)
//   options?
//     excludeDate?    'YYYY-MM-DD' — fechas iguales se descartan
//                     (típicamente la del día activo: queremos
//                     mostrar "última vez" como histórico, no
//                     reflejar lo que el alumno acaba de cargar).
//     completedOnly?  boolean (default true) — exigir completed=true
//
// Output: Map<exercise_id, log>. Cada log incluye exerciseId
// resuelto desde el plan_exercise para que el caller no tenga
// que volver a hacer el join.
// ============================================================
export function pickLastLogPerExercise(logs, planExercises, options = {}) {
  const { excludeDate = null, completedOnly = true } = options
  const planExById = new Map((planExercises || []).map((pe) => [pe.id, pe]))
  const byExercise = new Map()

  for (const log of logs || []) {
    if (!log) continue
    if (completedOnly && !log.completed) continue
    if (excludeDate && log.logged_date === excludeDate) continue

    // doc 49: resolvemos exercise_id desde el join embebido (cross-plan)
    // con fallback al mapa de planExercises del plan activo. El embebido
    // permite agrupar logs de plan_exercises que NO están en el plan actual
    // (planes anteriores con el mismo ejercicio de catálogo). El fallback
    // mantiene los tests y callers que pasan planExercises sin join.
    const planEx = planExById.get(log.plan_exercise_id)
    const exerciseId = log.plan_exercise?.exercise_id || planEx?.exercise_id
    if (!exerciseId) continue

    const prev = byExercise.get(exerciseId)
    if (!prev || compareLogsDesc(log, prev) < 0) {
      byExercise.set(exerciseId, { ...log, _exercise_id: exerciseId })
    }
  }

  return byExercise
}

// Comparador descendente por (logged_date DESC, id DESC).
// Devuelve negativo si `a` es MÁS reciente que `b`.
function compareLogsDesc(a, b) {
  if (a.logged_date && b.logged_date) {
    if (a.logged_date > b.logged_date) return -1
    if (a.logged_date < b.logged_date) return 1
  } else if (a.logged_date && !b.logged_date) {
    return -1
  } else if (!a.logged_date && b.logged_date) {
    return 1
  }
  // Tiebreak por id (uuid string compare) o created_at si está
  if (a.created_at && b.created_at) {
    if (a.created_at > b.created_at) return -1
    if (a.created_at < b.created_at) return 1
  }
  if (a.id && b.id) {
    if (a.id > b.id) return -1
    if (a.id < b.id) return 1
  }
  return 0
}

// ============================================================
// pickLastBlockLogPerBlock
// ------------------------------------------------------------
// Análogo a pickLastLogPerExercise pero para workout_block_logs
// (aerobic y circuit). Aquí no aplica el "global por exercise_id"
// porque el block_log es nivel bloque. Lo agrupamos por plan_block_id.
// ============================================================
export function pickLastBlockLogPerBlock(blockLogs, options = {}) {
  const { excludeDate = null, completedOnly = true } = options
  const byBlock = new Map()

  for (const bl of blockLogs || []) {
    if (!bl?.plan_block_id) continue
    if (completedOnly && !bl.completed) continue
    if (excludeDate && bl.logged_date === excludeDate) continue

    const prev = byBlock.get(bl.plan_block_id)
    if (!prev || compareLogsDesc(bl, prev) < 0) {
      byBlock.set(bl.plan_block_id, bl)
    }
  }

  return byBlock
}

// ============================================================
// pickLastCoachNotePerExercise
// ------------------------------------------------------------
// Devuelve Map<exercise_id, note> con la nota del COACH más
// reciente para cada ejercicio.
//
// Inputs:
//   notes      Array<note> — context_type='exercise', no asume orden
//   options?
//     visibilityShared?  default true — descarta coach_private (V1
//                        el alumno no debería verlas y RLS las filtra
//                        igual, pero somos defensivos).
// ============================================================
export function pickLastCoachNotePerExercise(notes, options = {}) {
  const { visibilityShared = true } = options
  const byExercise = new Map()

  for (const n of notes || []) {
    if (!n) continue
    if (n.deleted_at) continue
    if (n.author_role !== 'coach') continue
    if (n.context_type !== 'exercise') continue
    if (visibilityShared && n.visibility !== 'shared') continue
    if (!n.exercise_id) continue

    const prev = byExercise.get(n.exercise_id)
    if (!prev || compareNotesDesc(n, prev) < 0) {
      byExercise.set(n.exercise_id, n)
    }
  }

  return byExercise
}

// Comparador descendente por (created_at DESC, id DESC).
function compareNotesDesc(a, b) {
  if (a.created_at && b.created_at) {
    if (a.created_at > b.created_at) return -1
    if (a.created_at < b.created_at) return 1
  }
  if (a.id && b.id) {
    if (a.id > b.id) return -1
    if (a.id < b.id) return 1
  }
  return 0
}

// ============================================================
// countNotesByExercise
// ------------------------------------------------------------
// Devuelve Map<exercise_id, number> con la cantidad de notas
// VIVAS (ambos lados, shared) por ejercicio. Usado para el badge
// 💬N en el header de los cards.
//
// Las coach_private NO se cuentan: el alumno no las puede ver
// y nosotros estamos renderizando del lado del alumno.
// ============================================================
export function countNotesByExercise(notes) {
  const map = new Map()
  for (const n of notes || []) {
    if (!n) continue
    if (n.deleted_at) continue
    if (n.context_type !== 'exercise') continue
    if (n.visibility !== 'shared') continue
    if (!n.exercise_id) continue
    map.set(n.exercise_id, (map.get(n.exercise_id) || 0) + 1)
  }
  return map
}

// ============================================================
// groupNotesByExercise
// ------------------------------------------------------------
// Devuelve Map<exercise_id, Array<note>> con TODAS las notas
// del ejercicio ordenadas por created_at ASC (cronológico para
// renderizar el chat). Usado por el drawer.
//
// Solo notas shared (coach_private quedan fuera del lado alumno).
// ============================================================
export function groupNotesByExercise(notes) {
  const map = new Map()
  for (const n of notes || []) {
    if (!n) continue
    if (n.deleted_at) continue
    if (n.context_type !== 'exercise') continue
    if (n.visibility !== 'shared') continue
    if (!n.exercise_id) continue
    if (!map.has(n.exercise_id)) map.set(n.exercise_id, [])
    map.get(n.exercise_id).push(n)
  }
  // Ordenar ASC (timeline natural del chat) — uso `compareNotesDesc`
  // negado por simetría.
  for (const arr of map.values()) {
    arr.sort((a, b) => -compareNotesDesc(a, b))
  }
  return map
}

// ============================================================
// formatLastLogSummary
// ------------------------------------------------------------
// Convierte un workout_log a una etiqueta corta para el header:
//   "22.5kg / 8r" si hay peso (peso máximo del log + reps)
//   "8r" si bodyweight
//   "8s · PSE 8" si solo hay series sin peso/reps
//
// Inputs:
//   log  workout_log (acepta actual_weights_jsonb o actual_weights legacy)
//
// Estrategia:
//   - Peso: máximo del array actual_weights_jsonb (más visual que "20,20,22.5")
//   - Reps: máximo del array actual_reps_jsonb (similar)
//   - Si no hay peso (bodyweight), solo reps
// ============================================================
export function formatLastLogSummary(log) {
  if (!log) return ''

  const weights = readWeightsArray(log)
  const reps = readRepsArray(log)
  const maxWeight = weights.length > 0 ? Math.max(...weights.filter((w) => w != null)) : null
  const maxReps = reps.length > 0 ? Math.max(...reps.filter((r) => r != null)) : null

  const parts = []
  if (maxWeight != null && !isNaN(maxWeight)) {
    parts.push(`${formatNumber(maxWeight)}kg`)
  }
  if (maxReps != null && !isNaN(maxReps)) {
    parts.push(`${formatNumber(maxReps)}r`)
  }

  // Si no se pudo extraer peso ni reps, caer en sets
  if (parts.length === 0 && log.actual_sets) {
    parts.push(`${log.actual_sets}s`)
  }

  // Si está el PSE, lo agregamos solo cuando ya hay algo
  if (parts.length > 0 && log.perceived_difficulty) {
    parts.push(i18n.t('workout.pseValue', { value: log.perceived_difficulty }))
  }

  return parts.join(' · ')
}

// ============================================================
// formatLastBlockLogSummary
// ------------------------------------------------------------
// Convierte un workout_block_log a etiqueta corta:
//   "20 min · 3 rounds · PSE 7" (omite los que falten)
// ============================================================
export function formatLastBlockLogSummary(blockLog) {
  if (!blockLog) return ''
  const parts = []
  if (blockLog.actual_minutes != null) {
    parts.push(`${formatNumber(blockLog.actual_minutes)} min`)
  }
  if (blockLog.actual_rounds != null && blockLog.actual_rounds > 0) {
    parts.push(i18n.t('workout.rounds', { count: blockLog.actual_rounds }))
  }
  if (blockLog.perceived_difficulty) {
    parts.push(i18n.t('workout.pseValue', { value: blockLog.perceived_difficulty }))
  }
  return parts.join(' · ')
}

// ============================================================
// formatRelativeDate
// ------------------------------------------------------------
// Convierte una `logged_date` ('YYYY-MM-DD') a un texto relativo:
//   "hoy" — diff 0
//   "ayer" — diff 1
//   "hace N días" — 2..6
//   "DD/MM" — más viejo
//
// Tomar `today` como prop para tests determinísticos.
// ============================================================
export function formatRelativeDate(loggedDate, today = new Date()) {
  if (!loggedDate) return ''
  try {
    const logged = parseISO(loggedDate)
    const diff = differenceInCalendarDays(today, logged)
    if (diff === 0) return i18n.t('dates.relToday')
    if (diff === 1) return i18n.t('dates.relYesterday')
    if (diff > 1 && diff < 7) return i18n.t('dates.relDaysAgo', { count: diff })
    // Más viejo: DD/MM
    const day = String(logged.getDate()).padStart(2, '0')
    const month = String(logged.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  } catch {
    return loggedDate
  }
}

// ============================================================
// Helpers internos
// ============================================================
function readWeightsArray(log) {
  if (Array.isArray(log.actual_weights_jsonb)) {
    return log.actual_weights_jsonb.map((w) => coerceNum(w))
  }
  if (typeof log.actual_weights === 'string') {
    try {
      const parsed = JSON.parse(log.actual_weights)
      if (Array.isArray(parsed)) return parsed.map((w) => coerceNum(w))
    } catch {}
  }
  // Fallback al legacy: single value
  if (log.actual_weight != null) return [coerceNum(log.actual_weight)]
  return []
}

function readRepsArray(log) {
  if (Array.isArray(log.actual_reps_jsonb)) {
    return log.actual_reps_jsonb.map((r) => coerceNum(r))
  }
  if (typeof log.actual_reps === 'string') {
    try {
      const parsed = JSON.parse(log.actual_reps)
      if (Array.isArray(parsed)) return parsed.map((r) => coerceNum(r))
    } catch {}
  }
  return []
}

function coerceNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function formatNumber(n) {
  if (n == null) return ''
  // Sin decimales si es entero, sino máximo 2 decimales sin trailing 0
  if (Number.isInteger(n)) return String(n)
  return Number(n.toFixed(2)).toString()
}
