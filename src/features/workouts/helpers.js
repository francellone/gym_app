// ============================================================
// Helpers de la feature workouts
// ============================================================
// Constantes y utilities reutilizables entre TodayWorkoutPage y sus
// sub-componentes (ExerciseCard, DailyPSEModal, run cards, etc.).
// Extraídos del monolito original 2026-05-21 como parte del Tier 2.3.

// Etiquetas largas PSE — usadas en ExerciseCard para el dropdown completo.
export const PSE_OPTIONS = [
  { value: 1, label: '1 - Muy fácil' },
  { value: 2, label: '2 - Fácil' },
  { value: 3, label: '3 - Moderado' },
  { value: 4, label: '4 - Algo duro' },
  { value: 5, label: '5 - Duro' },
  { value: 6, label: '6 - Duro +' },
  { value: 7, label: '7 - Muy duro' },
  { value: 8, label: '8 - Muy duro +' },
  { value: 9, label: '9 - Casi máximo' },
  { value: 10, label: '10 - Máximo esfuerzo' },
]

// Etiquetas cortas PSE — usadas en el modal del día (DailyPSEModal),
// donde el espacio es chico y el grid muestra 5 columnas.
export const PSE_SHORT = [
  { value: 1, label: 'Muy fácil' },
  { value: 2, label: 'Fácil' },
  { value: 3, label: 'Moderado' },
  { value: 4, label: 'Algo duro' },
  { value: 5, label: 'Duro' },
  { value: 6, label: 'Duro +' },
  { value: 7, label: 'Muy duro' },
  { value: 8, label: 'Muy duro +' },
  { value: 9, label: 'Casi máx.' },
  { value: 10, label: 'Máximo' },
]

// Color de fondo según valor de PSE (rojo ≥8, naranja ≥5, verde resto).
export function pseColor(n) {
  if (n >= 8) return 'bg-red-500 text-white'
  if (n >= 5) return 'bg-orange-400 text-white'
  return 'bg-green-500 text-white'
}

// ============================================================
// Helpers de completado de bloques y secciones
// ============================================================
// Strength: todos los ejercicios marcados como completados en `logs`.
// Aerobic / circuit: existe un workout_block_log con `completed=true`.
export function isBlockCompleted(block, logs, blockLogs) {
  if (block.block_type === 'strength') {
    const exs = block.plan_exercises || []
    if (exs.length === 0) return false
    return exs.every((ex) => logs[ex.id]?.completed)
  }
  // aerobic / circuit: el estado de completado vive en workout_block_logs
  if (block.__virtual) return false // no debería caer aquí, pero por seguridad
  return !!blockLogs[block.id]?.completed
}

// Una sección está completa cuando todos sus bloques lo están.
export function isSectionCompleted(sectionBlocks, logs, blockLogs) {
  if (!sectionBlocks || sectionBlocks.length === 0) return false
  return sectionBlocks.every((b) => isBlockCompleted(b, logs, blockLogs))
}
