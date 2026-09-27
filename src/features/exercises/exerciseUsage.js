import { supabase } from '@/lib/supabase'

// ============================================================
// Uso de un ejercicio del catálogo (v45/v46)
// ------------------------------------------------------------
// exercise_usage(uuid) devuelve cuántas filas lo referencian por tabla.
// workout_logs, eval_responses, eval_tests y prescription_history son
// ON DELETE RESTRICT: con cualquiera > 0 el ejercicio no se puede borrar.
// ============================================================

export async function fetchUsage(exerciseId) {
  const { data, error } = await supabase.rpc('exercise_usage', { p_exercise_id: exerciseId })
  if (error) throw error
  return data || null
}

export function isReferenced(u) {
  if (!u) return false
  return (
    (u.workout_logs || 0) +
      (u.workout_block_logs || 0) +
      (u.eval_responses || 0) +
      (u.eval_tests || 0) +
      (u.prescription_history || 0) +
      (u.plan_exercises || 0) +
      (u.notes || 0) >
    0
  )
}

/** Partes legibles del uso ("3 planes", "2 personas"...). `t` = función de i18next. */
export function usageSummary(u, t) {
  if (!u) return []
  const K = 'coach.exercises.usage.'
  const partes = []
  if (u.plans > 0) partes.push(t(K + 'plans', { count: u.plans }))
  if (u.students > 0) partes.push(t(K + 'students', { count: u.students }))
  // v53: los aeróbicos registran en workout_block_logs con su exercise_id
  const entrenos = (u.workout_logs || 0) + (u.workout_block_logs || 0)
  if (entrenos > 0) partes.push(t(K + 'logs', { count: entrenos }))
  const evals = (u.eval_responses || 0) + (u.eval_tests || 0)
  if (evals > 0) partes.push(t(K + 'evals', { count: evals }))
  if (u.notes > 0) partes.push(t(K + 'notes', { count: u.notes }))
  return partes
}
