// ============================================================
// Normalización de nombres de ejercicio
// ------------------------------------------------------------
// `exercises.name` NO tiene índice único en la base, y el armador de planes
// es justo el contexto donde se generan duplicados ("Sentadilla búlgara" vs
// "Sentadilla Búlgara" vs "sentadilla bulgara "). Estas funciones detectan
// el choque para poder avisar ANTES de insertar.
// ============================================================

/** Minúsculas, sin acentos, sin espacios de más. */
export function normalizeExerciseName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Devuelve el primer ejercicio del catálogo cuyo nombre normalizado coincide.
 * `excludeId` evita que un ejercicio se marque como duplicado de sí mismo
 * cuando se lo está editando.
 */
export function findDuplicateByName(exercises, name, excludeId = null) {
  const target = normalizeExerciseName(name)
  if (!target) return null
  return (
    (exercises || []).find((e) => e.id !== excludeId && normalizeExerciseName(e.name) === target) ||
    null
  )
}
