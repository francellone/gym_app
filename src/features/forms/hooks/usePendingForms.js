/**
 * usePendingForms
 *
 * Devuelve los formularios pendientes (o empezados) de un alumno.
 *
 * Existe porque hasta v39 el único acceso a un formulario asignado era el
 * cartel del Inicio del alumno: si ese cartel no llegaba a renderizar (fetch
 * lento, el alumno entra directo a Entrenar, etc.) el formulario quedaba
 * inalcanzable — no hay item de menú ni notificación al enviarlo.
 * Caso real: Franco Cellone, form enviado el 27/8/2026, recibido por el
 * dispositivo (1 fila en la respuesta) y nunca visto.
 *
 * Con este hook el cartel vive en StudentLayout y se ve en todas las
 * pantallas del alumno.
 *
 * Args:
 *   studentId string — id del profile del alumno
 *
 * Returns:
 *   { intake, followUps, reload }
 *     intake     — assignment de tipo intake pendiente (o null)
 *     followUps  — array de assignments follow_up pendientes
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function usePendingForms(studentId) {
  const [forms, setForms] = useState([])

  // Sin setState sincrónico: todo lo que actualiza estado pasa después de un
  // await (regla react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    if (!studentId) return
    // Libera los programados que ya vencieron (idempotente, no bloquea:
    // si falla igual seguimos con el listado).
    try {
      await supabase.rpc('release_due_forms')
    } catch {
      /* no crítico */
    }
    const { data } = await supabase
      .from('intake_form_assignments')
      .select('id, form_kind, status, sent_at')
      .eq('student_id', studentId)
      .in('status', ['pending', 'in_progress'])
      .order('sent_at', { ascending: false })
    setForms(data || [])
  }, [studentId])

  useEffect(() => {
    let alive = true
    load()
    if (!studentId) return undefined

    // Realtime: si el coach envía o cancela un formulario mientras la app
    // está abierta, el cartel aparece/desaparece solo.
    const channel = supabase
      .channel(`pending-forms:${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intake_form_assignments',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          if (alive) load()
        }
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [studentId, load])

  // Si no hay alumno (logout, cambio de sesión) no mostramos nada, sin
  // depender de haber limpiado el estado.
  const visible = studentId ? forms : []

  return {
    intake: visible.find((f) => f.form_kind === 'intake') || null,
    followUps: visible.filter((f) => f.form_kind === 'follow_up'),
    reload: load,
  }
}

/**
 * A dónde mandar al alumno para responder un assignment.
 * El intake tiene página propia (no usa :assignmentId).
 */
export function formPathFor(assignment) {
  if (!assignment) return '/student/forms'
  return assignment.form_kind === 'intake' ? '/student/intake' : `/student/form/${assignment.id}`
}
