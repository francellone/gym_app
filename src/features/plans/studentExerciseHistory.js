// ============================================================
// Historial real de una persona por ejercicio (para armar el plan)
// ------------------------------------------------------------
// Al prescribir, el dato que le falta al coach es simple: "¿con cuánto
// viene esta persona en este ejercicio?". Estaba en workout_logs pero no
// aparecía en ningún lado del armador, así que la coach prescribía de
// memoria o abriendo otra pestaña.
//
// Sirve prescribas en kilos o en %RM: es contexto, no reemplaza nada.
// Para ejercicios sin peso (bodyweight) la métrica son las reps.
// ============================================================
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getLoggingWeightMode } from './helpers'

// Cuántas sesiones recientes definen el "viene cargando".
export const RECENT_SESSIONS = 3

function numbersFrom(value) {
  const arr = Array.isArray(value) ? value : []
  return arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
}

function readWeights(log) {
  if (Array.isArray(log?.actual_weights_jsonb)) return numbersFrom(log.actual_weights_jsonb)
  if (typeof log?.actual_weights === 'string') {
    try {
      return numbersFrom(JSON.parse(log.actual_weights))
    } catch {
      return []
    }
  }
  return []
}

function readReps(log) {
  if (Array.isArray(log?.actual_reps_jsonb)) return numbersFrom(log.actual_reps_jsonb)
  const single = Number(log?.actual_reps)
  return Number.isFinite(single) && single > 0 ? [single] : []
}

/**
 * Agrega los logs de una persona en un mapa por ejercicio.
 *
 * @param {Array} logs - filas de workout_logs con { logged_date, weight_mode,
 *        actual_weights_jsonb, actual_reps_jsonb, plan_exercise: {exercise_id} }
 * @returns {Map<string, {
 *   metric: 'kg'|'reps', sessions: number, lastDate: string,
 *   max: number, recentMin: number, recentMax: number
 * }>}
 */
export function buildExerciseHistoryMap(logs = []) {
  const byExercise = new Map()

  for (const log of logs) {
    const exerciseId = log?.plan_exercise?.exercise_id
    if (!exerciseId) continue

    // Un log de '%RM' no existe: la persona siempre registra kilos reales.
    const mode = getLoggingWeightMode(log?.weight_mode)
    const isBodyweight = mode === 'bodyweight'
    const values = isBodyweight ? readReps(log) : readWeights(log)
    if (values.length === 0) continue

    if (!byExercise.has(exerciseId)) byExercise.set(exerciseId, [])
    byExercise.get(exerciseId).push({
      date: log.logged_date || '',
      metric: isBodyweight ? 'reps' : 'kg',
      values,
    })
  }

  const out = new Map()
  for (const [exerciseId, sessions] of byExercise) {
    // Más reciente primero.
    sessions.sort((a, b) => String(b.date).localeCompare(String(a.date)))

    // Si el ejercicio cambió de modo con el tiempo, manda el más reciente:
    // mezclar kilos con reps daría un número sin sentido.
    const metric = sessions[0].metric
    const sameMetric = sessions.filter((s) => s.metric === metric)
    if (sameMetric.length === 0) continue

    const all = sameMetric.flatMap((s) => s.values)
    const recent = sameMetric.slice(0, RECENT_SESSIONS).flatMap((s) => s.values)

    out.set(exerciseId, {
      metric,
      sessions: sameMetric.length,
      lastDate: sameMetric[0].date || '',
      max: Math.max(...all),
      recentMin: Math.min(...recent),
      recentMax: Math.max(...recent),
    })
  }
  return out
}

/**
 * Trae el historial de UNA persona (todos sus ejercicios).
 * Paginado: workout_logs es la tabla que más crece de la app
 * (ver lib/fetchAllRows — PostgREST corta en 1000 filas EN SILENCIO).
 *
 * @param {Object} supabase
 * @param {string} studentId
 * @returns {Promise<Map>}
 */
export async function fetchExerciseHistory(supabase, studentId) {
  if (!studentId) return new Map()
  const logs = await fetchAllRows((from, to) =>
    supabase
      .from('workout_logs')
      .select(
        'logged_date, weight_mode, actual_weights_jsonb, actual_reps_jsonb, plan_exercise:plan_exercises!plan_exercise_id(exercise_id)'
      )
      .eq('student_id', studentId)
      .order('id')
      .range(from, to)
  )
  return buildExerciseHistoryMap(logs)
}
