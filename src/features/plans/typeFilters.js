// ============================================================
// planTypeFilters.js
// ------------------------------------------------------------
// Helpers para filtrar arrays de logs/sessions según el plan_type
// del plan asociado. Reutilizado por:
//   - StudentDashboard (streak + heatmap "Esta semana")
//   - ProgressPage (gráficos del alumno)
//   - StudentProgressTab (gráficos del coach)
//   - HistoryPage (cuando decidamos sumar el badge)
//
// La regla de negocio se fijó el 2026-05-10 al diagnosticar el
// bug del calendario: las evaluaciones nunca cuentan como
// entrenamiento. Cualquier plan training (active, replaced,
// paused, completed) sí cuenta.
// ============================================================

// ============================================================
// filterTrainingLogs
// ------------------------------------------------------------
// Inputs:
//   rows  array de objetos que tienen una propiedad `plan` con
//         shape { plan_type: 'training' | 'evaluation' | null }.
//         Aplica a workout_logs y workout_sessions joineados
//         con plans.
//
// Output: subset que pertenece a un plan training.
//
// Reglas:
//   - plan.plan_type === 'training'  → incluir
//   - plan.plan_type === 'evaluation' → excluir
//   - plan_type ausente / plan null  → incluir (default training,
//                                       compat con datos viejos
//                                       sin denormalizar)
// ============================================================
export function filterTrainingLogs(rows) {
  return (rows || []).filter((r) => {
    const pt = r?.plan?.plan_type
    return !pt || pt === 'training'
  })
}
