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

// ============================================================
// Agrupación de supersets en el run-side (fuerza)
// ============================================================
// Convención del coach: ejercicios con la MISMA letra (A1, A2, A3) forman
// una serie compuesta (superset). Se hacen encadenados, SIN pausa entre
// ellos; la pausa (`rest_time`, que el coach carga en el nº1 y los demás
// heredan) es del GRUPO, al terminar la vuelta — no entre series de cada
// ejercicio. Ver diagnostico_arquitec/45_convencion_agrupaciones.md.
//
// `block_label` tiene forma "A1"/"B2" (letra + número) cuando el ejercicio
// pertenece a un grupo. Otros valores (null, "Activación", texto libre) →
// ejercicio suelto, cuya pausa SÍ es entre series.

const GROUP_LABEL_RE = /^([A-Za-z])(\d+)$/

// Devuelve la letra de grupo (mayúscula) de un block_label "A1" → "A",
// o null si el label no sigue el patrón letra+número.
export function parseBlockLetter(label) {
  if (!label) return null
  const m = String(label).trim().match(GROUP_LABEL_RE)
  return m ? m[1].toUpperCase() : null
}

// Parte la lista (ya ordenada) de ejercicios de un bloque strength en items:
//   { type: 'solo', exercise }                      → ejercicio suelto
//   { type: 'group', letter, exercises, restTime }  → superset (2+ ejercicios)
// Sólo agrupa ejercicios CONSECUTIVOS con la misma letra. Una letra que
// aparece una sola vez queda como 'solo'. `restTime` es el primer rest_time
// no vacío del grupo (el del nº1 por orden).
export function groupStrengthExercises(exercises) {
  const list = exercises || []
  const items = []
  let i = 0
  while (i < list.length) {
    const letter = parseBlockLetter(list[i].block_label)
    if (!letter) {
      items.push({ type: 'solo', exercise: list[i] })
      i += 1
      continue
    }
    const members = [list[i]]
    let j = i + 1
    while (j < list.length && parseBlockLetter(list[j].block_label) === letter) {
      members.push(list[j])
      j += 1
    }
    if (members.length > 1) {
      const restTime = members.map((m) => m.rest_time).find((r) => r && r !== 'None') || null
      items.push({ type: 'group', letter, exercises: members, restTime })
    } else {
      items.push({ type: 'solo', exercise: members[0] })
    }
    i = j
  }
  return items
}
