/**
 * useNoteThreadUnread
 *
 * Devuelve el contador de notas no leídas para un (student, role) dado,
 * con suscripción realtime a `note_threads`.
 *
 * Útil para badges en el menú (alumno) y en los tabs (coach).
 *
 * Args:
 *   studentId  string  — id del profile del alumno
 *   role       'coach' | 'student' — qué counter mirar
 *
 * Returns:
 *   { count, loading }
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useNoteThreadUnread(studentId, role = 'coach') {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!studentId) {
      setCount(0)
      return
    }
    let alive = true
    let channel = null
    const field = role === 'coach' ? 'unread_for_coach' : 'unread_for_student'

    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('note_threads')
        .select(`id, ${field}`)
        .eq('student_id', studentId)
        .maybeSingle()
      if (!alive) return
      setCount(data?.[field] || 0)
      setLoading(false)
    }

    load()

    // Realtime: el trigger notes_bump_thread actualiza note_threads cuando
    // se insertan/leen notas. Nos suscribimos a UPDATE filtrando por student_id.
    channel = supabase
      .channel(`note-thread-unread:${role}:${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'note_threads',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          if (alive && payload.new) {
            setCount(payload.new[field] || 0)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'note_threads',
          filter: `student_id=eq.${studentId}`,
        },
        () => { if (alive) load() },
      )
      .subscribe()

    return () => {
      alive = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [studentId, role])

  return { count, loading }
}
