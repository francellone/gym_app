// ============================================================
// seriesCascade.js — "la serie 1 autocompleta a las demás"
// ------------------------------------------------------------
// Regla única, compartida por el armador del coach (PlanExerciseRow) y
// el registro de la persona (ExerciseCard, modo ajustar) desde v54:
//
//   Al editar la serie 1, se propaga el valor a las series posteriores
//   que estén VACÍAS o que todavía tengan el VALOR PREVIO de la serie 1
//   (o sea, que estaban "sincronizadas" con ella). Una serie editada a
//   mano nunca se pisa. Editar cualquier otra serie solo toca esa serie.
//
// Consecuencia útil: si el coach prescribió 10/10/10 y la persona cambia
// la serie 1 a 8, las tres quedan en 8. Si prescribió 10/8/6 y cambia la
// serie 1 a 9, las series 2 y 3 no se tocan (no coincidían con la 1).
//
// Soporta el tipeo carácter por carácter ('1' → '10' → '100'): en cada
// paso las series sincronizadas siguen coincidiendo con el valor previo.
//
// Función pura. Devuelve SIEMPRE un array nuevo.
// ============================================================

export function cascadeSetValue(current, serieIdx, val) {
  const next = [...(current || [])]
  if (serieIdx !== 0) {
    next[serieIdx] = val
    return next
  }
  const prevFirst = next[0]
  next[0] = val
  for (let i = 1; i < next.length; i++) {
    const isEmpty = next[i] === '' || next[i] == null
    const matchesPrev = next[i] === prevFirst
    if (isEmpty || matchesPrev) next[i] = val
  }
  return next
}
