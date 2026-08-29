// ============================================================
// Capa de datos del informe de progreso
// ------------------------------------------------------------
// Trae TODO lo que buildReport necesita para UNA persona. Estrategia: se
// trae la historia completa del alumno (no solo el período) porque los
// récords se definen contra toda la historia previa y el motor recorta
// período/previo/historia en memoria. Escala actual: ~750 logs máx por
// alumno — trivial paginado.
//
// TODO acá va con fetchAllRows: PostgREST corta en 1000 filas EN SILENCIO
// (ver src/lib/fetchAllRows.js). Ninguna query de este archivo puede usar
// .select() pelado, y toda query lleva orden estable.
// ============================================================
import { fetchAllRows } from '@/lib/fetchAllRows'

/**
 * @param {Object} supabase - cliente
 * @param {string} studentId
 * @returns {Promise<{logs, blockLogs, sessions, wellbeing, tagsByExercise}>}
 *   listo para pasarle a buildReport junto con from/to.
 */
export async function fetchReportData(supabase, studentId) {
  const [logs, blockLogs, sessions, wellbeing, tags, tagAssignments, rawAssignments] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('workout_logs')
          .select(
            `
          id, logged_date, actual_sets, actual_reps, actual_weight,
          actual_reps_jsonb, actual_weights_jsonb, actual_weights,
          weight_mode, unilateral, reps_unit, perceived_difficulty,
          plan:plans!plan_id(plan_type),
          plan_exercise:plan_exercises!plan_exercise_id(
            section,
            exercise:exercises!exercise_id(id, name)
          )
        `
          )
          .eq('student_id', studentId)
          .order('logged_date')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('workout_block_logs')
          .select(
            `
          id, logged_date, actual_minutes, actual_rounds, perceived_difficulty,
          plan:plans!plan_id(plan_type),
          plan_block:plan_blocks!plan_block_id(block_type, title)
        `
          )
          .eq('student_id', studentId)
          .order('logged_date')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('v_workout_session_intensity')
          .select('id, logged_date, borg_value, started_at, finished_at')
          .eq('student_id', studentId)
          .order('logged_date')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('wellbeing_logs')
          .select(
            'id, date, sleep_quality, nutrition_quality, hydration_quality, energy_level, stress_level, muscle_fatigue'
          )
          .eq('user_id', studentId)
          .order('date')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase.from('exercise_tags').select('id, name').order('id').range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('exercise_tag_assignments')
          .select('exercise_id, tag_id')
          .order('exercise_id')
          .order('tag_id')
          .range(from, to)
      ),
      // Asignaciones de plan: de acá sale el "previsto" del cumplimiento
      // (sessions_per_week del plan vigente en cada día del período).
      fetchAllRows((from, to) =>
        supabase
          .from('plan_assignments')
          .select(
            'start_date, end_date, status, plan_type, plan:plans!plan_id(sessions_per_week, plan_type)'
          )
          .eq('student_id', studentId)
          .order('start_date')
          .order('id')
          .range(from, to)
      ),
    ])

  const tagNameById = new Map(tags.map((t) => [t.id, t.name]))
  const tagsByExercise = new Map()
  for (const a of tagAssignments) {
    const name = tagNameById.get(a.tag_id)
    if (!name) continue
    if (!tagsByExercise.has(a.exercise_id)) tagsByExercise.set(a.exercise_id, [])
    tagsByExercise.get(a.exercise_id).push(name)
  }

  const assignments = rawAssignments.map((a) => ({
    start_date: a.start_date,
    end_date: a.end_date,
    status: a.status,
    plan_type: a.plan_type || a.plan?.plan_type || null,
    sessions_per_week: a.plan?.sessions_per_week ?? null,
  }))

  return { logs, blockLogs, sessions, wellbeing, tagsByExercise, assignments }
}
