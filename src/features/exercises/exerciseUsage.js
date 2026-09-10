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
      (u.eval_responses || 0) +
      (u.eval_tests || 0) +
      (u.prescription_history || 0) +
      (u.plan_exercises || 0) +
      (u.notes || 0) >
    0
  )
}

export function usageSummary(u) {
  if (!u) return []
  const partes = []
  if (u.plans > 0) partes.push(`${u.plans} ${u.plans === 1 ? 'plan' : 'planes'}`)
  if (u.students > 0) partes.push(`${u.students} ${u.students === 1 ? 'alumna' : 'alumnas'}`)
  if (u.workout_logs > 0) {
    partes.push(
      `${u.workout_logs} ${u.workout_logs === 1 ? 'entrenamiento registrado' : 'entrenamientos registrados'}`
    )
  }
  const evals = (u.eval_responses || 0) + (u.eval_tests || 0)
  if (evals > 0) partes.push(`${evals} ${evals === 1 ? 'evaluación' : 'evaluaciones'}`)
  if (u.notes > 0) partes.push(`${u.notes} ${u.notes === 1 ? 'nota' : 'notas'}`)
  return partes
}
