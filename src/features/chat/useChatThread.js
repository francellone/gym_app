// ============================================================
// useChatThread — contenido en vivo de una conversación
// ------------------------------------------------------------
// Carga notas + eventos del hilo, las etiquetas que necesitan (nombres de
// ejercicios, planes, días) y el bienestar de las semanas con evento.
// Se suscribe a cambios y marca como leído al abrir y al llegar algo nuevo
// del otro lado (con la pestaña visible).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { markThreadRead } from '@/features/notes/api'
import {
  fetchThreadContent,
  fetchWellbeing,
  fetchExerciseNames,
  fetchPlanTitles,
  fetchPlanExerciseSections,
  subscribeChat,
} from './chatApi'
import { wellbeingRangeFor } from './chatModel'

const EMPTY_LABELS = { exercises: new Map(), plans: new Map(), planExercises: new Map() }

function upsert(list, row, sortKey) {
  const idx = list.findIndex((x) => x.id === row.id)
  const next =
    idx === -1 ? [...list, row] : list.map((x) => (x.id === row.id ? { ...x, ...row } : x))
  return next.sort((a, b) => (Date.parse(a[sortKey]) || 0) - (Date.parse(b[sortKey]) || 0))
}

export function useChatThread({ threadId, studentId, viewerRole }) {
  const [notes, setNotes] = useState([])
  const [events, setEvents] = useState([])
  const [wellbeing, setWellbeing] = useState([])
  const [labels, setLabels] = useState(EMPTY_LABELS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const readTimer = useRef(null)
  const labelTimer = useRef(null)
  const latest = useRef({ notes: [], events: [] })

  const markRead = useCallback(() => {
    if (!threadId || !viewerRole) return
    clearTimeout(readTimer.current)
    readTimer.current = setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      markThreadRead(threadId, viewerRole)
    }, 1200)
  }, [threadId, viewerRole])

  const loadExtras = useCallback(
    async (ns, es) => {
      const exIds = [...ns.map((n) => n.exercise_id), ...es.map((e) => e.exercise_id)]
      const planIds = ns.map((n) => n.plan_id)
      const peIds = ns.map((n) => n.plan_exercise_id)
      const [ex, pl, pe] = await Promise.all([
        fetchExerciseNames(exIds),
        fetchPlanTitles(planIds),
        fetchPlanExerciseSections(peIds),
      ])
      setLabels({
        exercises: ex.data || new Map(),
        plans: pl.data || new Map(),
        planExercises: pe.data || new Map(),
      })
      const range = wellbeingRangeFor(es)
      if (range && studentId) {
        const wb = await fetchWellbeing(studentId, range.from, range.to)
        setWellbeing(wb.data || [])
      } else {
        setWellbeing([])
      }
    },
    [studentId]
  )

  const reload = useCallback(async () => {
    if (!threadId) return
    const { data, error: err } = await fetchThreadContent(threadId)
    if (err) {
      setError(err)
      setLoading(false)
      return
    }
    latest.current = data
    setNotes(data.notes)
    setEvents(data.events)
    setError(null)
    setLoading(false)
    loadExtras(data.notes, data.events)
  }, [threadId, loadExtras])

  useEffect(() => {
    setLoading(true)
    setNotes([])
    setEvents([])
    latest.current = { notes: [], events: [] }
    reload().then(() => markRead())
  }, [reload, markRead])

  useEffect(() => {
    if (!threadId) return undefined
    const off = subscribeChat(threadId, ({ table, event, new: row, old }) => {
      if (table === 'notes') {
        if (event === 'DELETE' || row?.deleted_at) {
          const id = row?.id || old?.id
          setNotes((prev) => {
            const next = prev.filter((n) => n.id !== id)
            latest.current.notes = next
            return next
          })
          return
        }
        if (!row) return
        setNotes((prev) => {
          const next = upsert(prev, row, 'created_at')
          latest.current.notes = next
          return next
        })
        const incoming =
          event === 'INSERT' &&
          ((viewerRole === 'coach' && row.author_role === 'student') ||
            (viewerRole === 'student' && row.author_role === 'coach'))
        if (incoming) markRead()
      } else {
        if (event === 'DELETE') {
          setEvents((prev) => {
            const next = prev.filter((e) => e.id !== old?.id)
            latest.current.events = next
            return next
          })
          return
        }
        if (!row) return
        setEvents((prev) => {
          const next = upsert(prev, row, 'occurred_at')
          latest.current.events = next
          return next
        })
        if (event === 'INSERT') markRead()
      }
      clearTimeout(labelTimer.current)
      labelTimer.current = setTimeout(
        () => loadExtras(latest.current.notes, latest.current.events),
        600
      )
    })
    return () => {
      off()
      clearTimeout(labelTimer.current)
    }
  }, [threadId, viewerRole, markRead, loadExtras])

  useEffect(() => () => clearTimeout(readTimer.current), [])

  /** Agrega o actualiza localmente (después de un guardado propio). */
  const applyNote = useCallback((row) => {
    if (!row?.id) return
    setNotes((prev) => {
      const next = row.deleted_at
        ? prev.filter((n) => n.id !== row.id)
        : upsert(prev, row, 'created_at')
      latest.current.notes = next
      return next
    })
  }, [])

  return { notes, events, wellbeing, labels, loading, error, reload, applyNote }
}
