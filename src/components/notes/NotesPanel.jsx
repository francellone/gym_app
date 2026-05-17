/**
 * NotesPanel
 *
 * Orquestador del panel de notas:
 *   - Mantiene estado de filtros
 *   - Trae available tags + exercises para los filtros y los cards
 *   - Usa useNotes para la lista (incluye realtime)
 *   - Render: NotesFilters arriba + lista de NoteCard + NoteComposer (disabled)
 *
 * Props:
 *   threadId      string  — id del note_thread
 *   viewerRole    'coach' | 'student'
 *   studentId     string  (opcional, solo informativo)
 *   authorId      string  (opcional, lo necesitará el composer en Fase B)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { useNotes } from '../../hooks/useNotes'
import { listFilterOptions, markThreadRead } from '../../lib/notes'
import NotesFilters from './NotesFilters'
import NoteCard from './NoteCard'
import NoteComposer from './NoteComposer'

export default function NotesPanel({ threadId, viewerRole = 'coach', authorId }) {
  const [filters, setFilters] = useState({})
  const [availableTags, setAvailableTags] = useState([])
  const [exercises, setExercises] = useState([])
  const [availableMuscleGroups, setAvailableMuscleGroups] = useState([])
  const [availableBlockTypes, setAvailableBlockTypes] = useState([])

  // ── Hook principal de notas (con realtime) ────────────────────
  const { notes, loading, error, hasMore, loadMore, reload, unreadIds, unreadCount } = useNotes({
    threadId,
    filters,
    viewerRole,
  })

  // ── Snapshot de no-leídas al primer render: las que entraron como
  // unread se quedan marcadas durante toda la visita aunque después
  // hagamos mark-as-read. Así el coach ve cuáles eran "nuevas". ──
  const initialUnreadRef = useRef(new Set())
  useEffect(() => {
    for (const id of unreadIds) initialUnreadRef.current.add(id)
  }, [unreadIds])
  useEffect(() => {
    // Reset al cambiar de thread
    initialUnreadRef.current = new Set()
  }, [threadId])

  // ── Mark as read on mount (después de 1.5s de visualización) ──
  const hasMarkedRef = useRef(false)
  useEffect(() => {
    hasMarkedRef.current = false
  }, [threadId])
  useEffect(() => {
    if (!threadId || notes.length === 0 || hasMarkedRef.current) return
    if (unreadCount === 0) return // nada para marcar
    const t = setTimeout(async () => {
      hasMarkedRef.current = true
      await markThreadRead(threadId, viewerRole)
      // El UPDATE viaja por realtime y refresca los notes con read_at_*
    }, 1500)
    return () => clearTimeout(t)
  }, [threadId, notes.length, unreadCount, viewerRole])

  // ── Carga de opciones de filtros desde la RPC del thread ──────
  // (una sola llamada que trae exercises + muscle_groups + block_types
  //  + tags, todos derivados de las notas reales del thread)
  useEffect(() => {
    let alive = true
    async function fetchOpts() {
      if (!threadId) {
        setExercises([]); setAvailableMuscleGroups([])
        setAvailableBlockTypes([]); setAvailableTags([])
        return
      }
      const { data } = await listFilterOptions(threadId)
      if (!alive) return
      setExercises(data.exercises)
      setAvailableMuscleGroups(data.muscle_groups)
      setAvailableBlockTypes(data.block_types)
      setAvailableTags(data.tags)
    }
    fetchOpts()
    return () => { alive = false }
  }, [threadId])

  // ── Mapa id → ejercicio (para resolver contexto en NoteCard) ──
  const exercisesMap = useMemo(() => {
    const m = new Map()
    for (const ex of exercises) m.set(ex.id, ex)
    return m
  }, [exercises])

  // ── Mapa id → nota (para resolver parent en replies) ──────────
  const notesById = useMemo(() => {
    const m = new Map()
    for (const n of notes) m.set(n.id, n)
    return m
  }, [notes])

  // Callback: click en tag desde NoteCard agrega al filtro
  const handleTagClick = useCallback((tag) => {
    setFilters(prev => {
      const current = Array.isArray(prev.tags) ? prev.tags : []
      if (current.includes(tag)) return prev
      return { ...prev, tags: [...current, tag] }
    })
  }, [])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header con contador de no leídas */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 text-orange-700 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
            <span className="font-medium">
              {unreadCount} {unreadCount === 1 ? 'nota nueva' : 'notas nuevas'}
            </span>
          </div>
          <span className="text-[11px] text-orange-600/80">
            Se marcarán como leídas en unos segundos
          </span>
        </div>
      )}

      {/* Filtros */}
      <NotesFilters
        value={filters}
        onChange={setFilters}
        exercises={exercises}
        availableTags={availableTags}
        availableMuscleGroups={availableMuscleGroups}
        availableBlockTypes={availableBlockTypes}
      />

      {/* Error banner */}
      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error.message}</span>
          <button
            type="button"
            onClick={reload}
            className="text-xs font-semibold text-red-700 hover:text-red-900"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de notas */}
      <div className="space-y-3">
        {loading && notes.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && notes.length === 0 && !error && (
          <div className="card text-center py-10 text-gray-400">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-gray-500">Sin notas</p>
            <p className="text-xs text-gray-400 mt-1">
              No hay notas para los filtros actuales.
            </p>
          </div>
        )}

        {notes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            parentNote={note.parent_note_id ? notesById.get(note.parent_note_id) : null}
            exercisesMap={exercisesMap}
            onTagClick={handleTagClick}
            isUnread={initialUnreadRef.current.has(note.id)}
          />
        ))}

        {/* Botón "Cargar más" */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              {loading
                ? <Loader2 size={12} className="animate-spin" />
                : null}
              Cargar más
            </button>
          </div>
        )}
      </div>

      {/* Composer (deshabilitado en Fase A) */}
      <NoteComposer
        threadId={threadId}
        authorId={authorId}
        authorRole={viewerRole}
        viewerRole={viewerRole}
      />
    </div>
  )
}
