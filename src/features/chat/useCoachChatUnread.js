// Total de no leídos de todas las conversaciones de la coach (número de
// "Chat" en la barra lateral). Mensajes y eventos suman al mismo contador.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subscribeCoachThreads } from './chatApi'

export function useCoachChatUnread(coachId) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!coachId) return undefined
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('note_threads')
        .select('unread_for_coach')
        .eq('coach_id', coachId)
      if (alive) setCount((data || []).reduce((a, r) => a + (r.unread_for_coach || 0), 0))
    }
    load()
    const off = subscribeCoachThreads(coachId, load, 'badge')
    return () => {
      alive = false
      off()
    }
  }, [coachId])
  return count
}
