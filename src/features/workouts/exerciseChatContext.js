// ============================================================
// exerciseChatContext — la conversación de cada ejercicio en Entrenar
// ------------------------------------------------------------
// 2026-10-22 (Franco): la persona deja notas en el ejercicio y quiere que la
// coach le conteste ahí, porque lo va a ver cuando mire el ejercicio. Y la
// coach puede iniciar un comentario sobre un ejercicio desde el chat.
// TodayWorkoutPage provee las notas por ejercicio y `send`; las tarjetas de
// los tres tipos de bloque las leen por contexto (paridad sin pasar props).
// ============================================================

import { createContext, useContext } from 'react'

export const ExerciseChatContext = createContext(null)

export function useExerciseChat() {
  return useContext(ExerciseChatContext)
}

/**
 * A qué va un mensaje nuevo sobre el ejercicio:
 * - si el otro lado ya escribió sobre él → respuesta a su último mensaje
 *   (hereda el registro o el ejercicio del plan: se ve en el mismo lugar);
 * - si no → un comentario nuevo sobre el ejercicio del plan.
 * Las copias guardadas desde el chat no son conversación: no se responden.
 * @param {Array} notes  notas del ejercicio, ascendentes
 * @param {'coach'|'student'} authorRole
 * @returns {{ kind: 'reply', parentId } | { kind: 'new' }}
 */
export function exerciseMessageTarget(notes = [], authorRole) {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]
    if (!n || n.deleted_at || n.source_note_id) continue
    if (n.visibility !== 'shared') continue
    if (n.author_role !== authorRole) return { kind: 'reply', parentId: n.id }
  }
  return { kind: 'new' }
}

/** Ejercicio del plan donde queda un comentario nuevo: el del día que se ve. */
export function pickPlanExercise(planExercises = [], exerciseId, activeDay) {
  const all = planExercises.filter((pe) => pe?.exercise_id === exerciseId)
  return (
    all.find((pe) => pe.section === activeDay) ||
    all.find((pe) => pe.section === 'activation') ||
    all[0] ||
    null
  )
}

/**
 * Últimos mensajes de conversación (sin copias), para el recuadro. Regla de
 * Franco ("primero la del otro"): si entre los últimos no hay ninguno del
 * otro lado, se trae su último mensaje, que es lo que importa ver.
 */
export function lastConversation(notes = [], max = 2, viewerRole = null) {
  const live = notes.filter((n) => n && !n.deleted_at && !n.source_note_id)
  const tail = live.slice(-max)
  if (!viewerRole || tail.some((n) => n.author_role !== viewerRole)) return tail
  const other = [...live].reverse().find((n) => n.author_role !== viewerRole)
  if (!other) return tail
  return [other, ...tail.slice(-(max - 1))]
}
