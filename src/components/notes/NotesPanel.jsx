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

import { useEffect, useMemo, useState, useCallback } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { useNotes } from '../../hooks/useNotes'
import { listAvailableTags, listExercisesForFilter } from '../../lib/notes'
import NotesFilters from './NotesFilters'
import NoteCard from './NoteCard'
import NoteComposer from './NoteComposer'

export default function NotesPanel({ threadId, viewerRole = 'coach', authorId }) {
  const [filters, setFilters] = useState({})
  const [availableTags, setAvailableTags] = useState([])
  const [exercises, setExercises] = useState([])

  // ── Hook principal de notas (con realtime) ────────────────────
  const { notes, loading, error, hasMore, loadMore, reload } = useNotes({
    threadId,
    filters,
    viewerRole,
  })

  // ── Carga inicial de tags + exercises ─────────────────────────
  useEffect(() => {
    let alive = true
    async function fetchAux() {
      const [tagsRes, exercisesRes] = await Promise.all([
        threadId ? listAvailableTags(threadId) : Promise.resolve({ data: [], error: null }),
        listExercisesForFilter(),
      ])
      if (!alive) return
      setAvailableTags(tagsRes.data || [])
      setExercises(exercisesRes.data || [])
    }
    fetchAux()
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
      {/* Filtros */}
      <NotesFilters
        value={filters}
        onChange={setFilters}
        exercises={exercises}
        availableTags={availableTags}
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
