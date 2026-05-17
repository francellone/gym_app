/**
 * useNotes
 *
 * Hook que gestiona la lectura del Panel de Notas:
 *  - Carga paginada (keyset) vía listNotes
 *  - Suscripción realtime al thread (subscribeThread)
 *  - Merge de inserts/updates en estado local
 *  - Tratar deleted_at != null como remove
 *  - Para alumno: red de seguridad filtrando coach_private en cliente
 *  - Re-cargar al volver a foreground tras >30s oculto
 *
 * Args:
 *   threadId  string|null
 *   filters   objeto (ver lib/notes.js filters schema)
 *   viewerRole 'coach' | 'student'
 *
 * Returns:
 *   { notes, loading, error, hasMore, loadMore, reload }
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  listNotes,
  subscribeThread,
} from '../lib/notes'

// Tiempo mínimo en background para forzar reload al volver
const VISIBILITY_RELOAD_THRESHOLD_MS = 30_000
// Tiempo de gracia para considerar el canal "caído"
const CHANNEL_REJOIN_CHECK_MS = 5_000

export function useNotes({ threadId, filters = {}, viewerRole = 'coach' } = {}) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)

  // Refs auxiliares
  const abortRef = useRef(null)            // AbortController del fetch en vuelo
  const unsubscribeRef = useRef(null)      // función cleanup del canal realtime
  const lastHiddenAtRef = useRef(null)     // timestamp cuando la pestaña se ocultó
  const channelCheckTimerRef = useRef(null) // setTimeout para re-sub

  // Serializamos filtros como string para usar de dep en useEffect
  const filtersKey = JSON.stringify(filters || {})

  // ── Filtro cliente: alumno no ve coach_private (red de seguridad) ──
  const filterForViewer = useCallback((rows) => {
    if (!Array.isArray(rows)) return []
    if (viewerRole === 'student') {
      return rows.filter(n => n.visibility !== 'coach_private')
    }
    return rows
  }, [viewerRole])

  // ── Carga inicial (o tras cambio de filtros / threadId) ───────
  const loadFirstPage = useCallback(async () => {
    if (!threadId) {
      setNotes([])
      setNextCursor(null)
      return
    }
    // Cancelar fetch previo
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setError(null)

    const { data, nextCursor: cursor, error: err, aborted } = await listNotes(
      threadId,
      filters,
      { signal: ac.signal },
    )
    if (aborted) return
    if (err) {
      setError(err)
      setLoading(false)
      return
    }
    setNotes(filterForViewer(data))
    setNextCursor(cursor)
    setLoading(false)
  }, [threadId, filtersKey, filterForViewer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar más (siguiente página) ─────────────────────────────
  const loadMore = useCallback(async () => {
    if (!threadId || !nextCursor || loading) return
    setLoading(true)
    const { data, nextCursor: cursor, error: err } = await listNotes(
      threadId,
      filters,
      { cursor: nextCursor },
    )
    if (err) {
      setError(err)
      setLoading(false)
      return
    }
    setNotes(prev => {
      // Mergear evitando duplicados (por id)
      const existingIds = new Set(prev.map(n => n.id))
      const merged = [...prev]
      for (const row of filterForViewer(data)) {
        if (!existingIds.has(row.id)) merged.push(row)
      }
      return merged
    })
    setNextCursor(cursor)
    setLoading(false)
  }, [threadId, nextCursor, loading, filtersKey, filterForViewer]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload manual (expuesto al consumidor) ────────────────────
  const reload = useCallback(() => {
    loadFirstPage()
  }, [loadFirstPage])

  // ── Suscripción realtime ──────────────────────────────────────
  const setupSubscription = useCallback(() => {
    if (!threadId) return
    // Limpiar suscripción anterior
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    unsubscribeRef.current = subscribeThread(threadId, ({ event, new: newRow, old: oldRow }) => {
      // ── DELETE físico (no debería pasar, no hay policy) ──
      if (event === 'DELETE') {
        if (oldRow?.id) setNotes(prev => prev.filter(n => n.id !== oldRow.id))
        return
      }

      // ── Soft-delete: deleted_at != null ⇒ remove ──
      if (newRow?.deleted_at) {
        setNotes(prev => prev.filter(n => n.id !== newRow.id))
        return
      }

      // Red de seguridad: alumno no debe ver coach_private aunque
      // (idealmente) RLS ya lo bloquea. Si una nota visible cambió a
      // coach_private (UPDATE) o llegó como tal (INSERT), la sacamos
      // de la lista local — no basta con `return`, porque la nota
      // anterior podría estar mostrada.
      if (viewerRole === 'student' && newRow?.visibility === 'coach_private') {
        setNotes(prev => prev.filter(n => n.id !== newRow.id))
        return
      }

      // Si la nota no matchea los filtros actuales, no la mergeamos.
      // (Validación liviana en cliente — para algunos filtros como
      // search/tags hace falta evaluar el body; lo dejamos así para
      // no esconder mensajes nuevos al usuario, prefiriendo mostrar
      // un poco más que ocultar.)
      if (!matchesFilters(newRow, filters)) return

      setNotes(prev => {
        const idx = prev.findIndex(n => n.id === newRow.id)
        if (idx >= 0) {
          // UPDATE: reemplazar in-place
          const next = [...prev]
          next[idx] = { ...next[idx], ...newRow }
          return next
        }
        // INSERT: prepend (orden DESC por created_at)
        return [newRow, ...prev]
      })
    })

    // Chequeo de salud del canal (re-suscribir si no joineó)
    if (channelCheckTimerRef.current) clearTimeout(channelCheckTimerRef.current)
    channelCheckTimerRef.current = setTimeout(() => {
      // Preferimos el getter expuesto por el cleanup (closure del canal real)
      // en lugar de buscar por topic, que es frágil ante cambios de supabase-js.
      const state = unsubscribeRef.current?.getState?.() ?? null
      if (state && state !== 'joined') {
        // Re-suscribir
        setupSubscription()
      }
    }, CHANNEL_REJOIN_CHECK_MS)
  }, [threadId, viewerRole, filtersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efecto principal: cargar + suscribir cuando cambia threadId/filters ──
  useEffect(() => {
    if (!threadId) {
      setNotes([])
      setNextCursor(null)
      setLoading(false)
      return
    }
    loadFirstPage()
    setupSubscription()

    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      if (channelCheckTimerRef.current) {
        clearTimeout(channelCheckTimerRef.current)
        channelCheckTimerRef.current = null
      }
    }
  }, [threadId, filtersKey, loadFirstPage, setupSubscription])

  // ── Visibility change: re-cargar tras >30s oculto ─────────────
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now()
        return
      }
      if (document.visibilityState === 'visible' && lastHiddenAtRef.current) {
        const hiddenFor = Date.now() - lastHiddenAtRef.current
        lastHiddenAtRef.current = null
        if (hiddenFor > VISIBILITY_RELOAD_THRESHOLD_MS && threadId) {
          loadFirstPage()
          // Validar canal también vía el getter del cleanup actual
          const state = unsubscribeRef.current?.getState?.() ?? null
          if (state !== 'joined') setupSubscription()
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [threadId, loadFirstPage, setupSubscription])

  // ── Auth logout: limpiar todo ─────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (abortRef.current) abortRef.current.abort()
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
        setNotes([])
        setNextCursor(null)
        setError(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return {
    notes,
    loading,
    error,
    hasMore: !!nextCursor,
    loadMore,
    reload,
  }
}

// ============================================================
// Helper: chequeo liviano de filtros en cliente para inserts
// realtime. Devuelve true si la fila matchea (o no podemos
// determinar y conviene mostrar igual). NO replica filtros
// complejos del back (search/tags overlaps) → para esos casos
// retornamos true y dejamos que el usuario haga reload si hace
// falta. Es mejor mostrar de más que esconder un mensaje nuevo.
// ============================================================
function matchesFilters(row, filters) {
  if (!row) return false
  if (!filters || Object.keys(filters).length === 0) return true

  if (filters.from && row.created_at < filters.from) return false
  if (filters.to && row.created_at > filters.to) return false
  if (filters.exerciseId && row.exercise_id !== filters.exerciseId) return false
  if (filters.muscleGroup && row.muscle_group !== filters.muscleGroup) return false
  if (filters.blockType && row.block_type !== filters.blockType) return false
  if (filters.contextType && row.context_type !== filters.contextType) return false
  if (filters.contextId && row.context_id !== filters.contextId) return false
  if (filters.visibility && row.visibility !== filters.visibility) return false
  if (filters.authorRole && row.author_role !== filters.authorRole) return false
  // search / tags: no podemos evaluar overlaps/ilike eficientemente
  // acá. Dejamos pasar y confiamos en que el usuario filtre via reload.
  return true
}
