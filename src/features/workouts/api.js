// ============================================================
// workouts/api.js — wrappers de RPCs y armado de payloads
// ------------------------------------------------------------
// Hoy: sólo `buildSaveWorkoutLogArgs`, extraído de TodayWorkoutPage
// como parte del Tier 3.2 para hacer testeable la firma de la RPC
// `save_workout_log` (16 params).
//
// Si en el futuro otras pantallas (CircuitBlockRunCard, ExerciseCard
// avanzado) replican lógica del payload de la RPC, centralizarla acá.
// ============================================================

// ============================================================
// buildSaveWorkoutLogArgs
// ------------------------------------------------------------
// Arma el objeto `rpcArgs` que se le pasa a `supabase.rpc('save_workout_log', ...)`.
//
// Por qué existe como función separada:
//   1. El front mete keys "internas" con underscore prefix (_noteBody)
//      que NO deben llegar a la RPC. Acá las filtramos uniformemente.
//   2. Documenta la firma de la RPC (16 params) en un solo lugar.
//   3. Permite testear el shape sin necesidad de Supabase ni del render
//      completo del TodayWorkoutPage.
//
// Inputs:
//   profile         { id }                        — alumno logueado
//   assignment      { plan_id }                   — plan vigente del alumno
//   planExerciseId  uuid                          — ejercicio del plan que estamos logueando
//   selectedDate    'YYYY-MM-DD'                  — fecha del log
//   isToday         boolean                       — true si selectedDate === hoy
//   data            { p_reps, p_weights, p_weight_mode, p_unilateral,
//                     p_reps_unit, p_actual_sets, p_perceived_difficulty,
//                     p_perceived_difficulty_label, p_notes, p_completed,
//                     _noteBody?, ... }            — payload armado por ExerciseCard / CircuitBlockRunCard
//   existingLog     { id } | null                 — si existe, hace UPDATE; si no, INSERT
//
// Output: objeto plano con todos los p_* listos para `supabase.rpc(...)`.
// ============================================================
export function buildSaveWorkoutLogArgs({
  profile,
  assignment,
  planExerciseId,
  selectedDate,
  isToday,
  data,
  existingLog,
}) {
  if (!profile?.id) throw new Error('buildSaveWorkoutLogArgs: profile.id requerido')
  if (!assignment?.plan_id) throw new Error('buildSaveWorkoutLogArgs: assignment.plan_id requerido')
  if (!planExerciseId) throw new Error('buildSaveWorkoutLogArgs: planExerciseId requerido')
  if (!selectedDate) throw new Error('buildSaveWorkoutLogArgs: selectedDate requerido')

  // Stripear keys internas (prefijo "_") — convención para que el caller
  // pueda transportar metadata extra (como _noteBody) sin contaminar el RPC.
  const rpcData = {}
  for (const [k, v] of Object.entries(data || {})) {
    if (!k.startsWith('_')) rpcData[k] = v
  }

  return {
    p_log_id: existingLog?.id ?? null,
    p_student_id: profile.id,
    p_plan_id: assignment.plan_id,
    p_plan_exercise_id: planExerciseId,
    p_logged_date: selectedDate,
    p_logged_late: !isToday,
    ...rpcData,
  }
}

// Extrae el body de la nota desde el payload "ancho" que pasan los componentes.
// Mantiene un solo punto de definición para el contrato (_noteBody).
export function extractNoteBody(data) {
  return data?._noteBody || ''
}
