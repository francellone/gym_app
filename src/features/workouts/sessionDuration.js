// ============================================================
// sessionDuration.js — cuándo una duración de sesión es creíble
// ------------------------------------------------------------
// La duración sale de started_at (primer ejercicio guardado) y
// finished_at (último guardado o cierre del día). No mide el
// entrenamiento real, mide cuándo la persona tocó la app. Por eso hay
// dos formas habituales de que dé un número que no significa nada:
//
//   1. Carga al final. La persona entrena sin el celular y después
//      confirma todo junto. Caso real (2026-11-23): 12 ejercicios
//      guardados en 90 segundos, y el dashboard mostraba "2 min".
//   2. Sesión abierta. La persona deja la app abierta y cierra horas
//      después. Caso real (2026-11-23): de 04:50 a 08:07, "199 min".
//
// Decisión de Franco (2026-11-25): esas duraciones NO se muestran ni
// entran en promedios o medianas. Se ocultan cuando:
//   - duran menos de SESSION_MIN_MINUTES (10) minutos,
//   - duran más de SESSION_MAX_MINUTES (150) minutos, o
//   - dan menos de MIN_MINUTES_PER_EXERCISE (1) minuto por ejercicio
//     (solo si se conoce cuántos ejercicios tuvo la sesión).
// El resto de la sesión (día, ejercicios, PSE) se sigue mostrando.
// Los horarios de inicio y fin, cuando se muestran, son datos reales
// y no se tocan; lo que se oculta es la duración calculada.
// ============================================================

export const SESSION_MIN_MINUTES = 10
export const SESSION_MAX_MINUTES = 150
export const MIN_MINUTES_PER_EXERCISE = 1

/** Minutos entre inicio y fin, o null si falta alguno o no es positivo. */
export function rawSessionMinutes(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const minutes = Math.round((end - start) / 60000)
  return minutes > 0 ? minutes : null
}

/** true si la duración se puede mostrar (ver criterios arriba). */
export function isCredibleDuration(minutes, exerciseCount = null) {
  if (minutes == null || !Number.isFinite(minutes)) return false
  if (minutes < SESSION_MIN_MINUTES || minutes > SESSION_MAX_MINUTES) return false
  if (exerciseCount != null && exerciseCount > 0) {
    if (minutes / exerciseCount < MIN_MINUTES_PER_EXERCISE) return false
  }
  return true
}

/** Duración creíble en minutos, o null si no hay que mostrarla. */
export function credibleSessionMinutes(startedAt, finishedAt, exerciseCount = null) {
  const minutes = rawSessionMinutes(startedAt, finishedAt)
  return isCredibleDuration(minutes, exerciseCount) ? minutes : null
}
