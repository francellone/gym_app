// ============================================================
// editRequest.js — "abrí este registro para corregirlo"
// ------------------------------------------------------------
// La celebración de una marca vive en el layout y la tarjeta del ejercicio
// en Entrenar; no comparten árbol de props. Un evento de ventana los une:
// la tarjeta que tenga ese plan_exercise_id se abre en modo ajustar y se
// desplaza a la vista.
// ============================================================
export const EDIT_LOG_EVENT = 'gym:edit-log'

export function requestLogEdit(planExerciseId) {
  if (!planExerciseId || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EDIT_LOG_EVENT, { detail: { planExerciseId } }))
}

// Suscripción: devuelve la función para desuscribirse.
export function onLogEditRequest(handler) {
  if (typeof window === 'undefined') return () => {}
  const fn = (e) => handler(e?.detail?.planExerciseId)
  window.addEventListener(EDIT_LOG_EVENT, fn)
  return () => window.removeEventListener(EDIT_LOG_EVENT, fn)
}
