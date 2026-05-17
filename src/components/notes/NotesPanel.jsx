/**
 * NotesPanel
 *
 * Orquestador del panel de notas.
 *
 * Responsabilidades:
 *   - Estado de filtros + replies
 *   - Trae opciones de filtros (RPC notes_thread_filter_options)
 *   - Usa useNotes para la lista (con realtime)
 *   - Mark-as-read automático tras 1.5s
 *   - Refetch de opciones de filtro al recibir INSERT por realtime (D4)
 *   - Render: filtros + lista de NoteCard + NoteComposer
 *
 * Props:
 *   threadId      string  — id del note_thread
 *   viewerRole    'coach' | 'student'
 *   studentId     string  (opcional, solo informativo)
 *   authorId      string  — id del profile autenticado (lo usa NoteComposer)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { useNotes } from '../../hooks/useNotes'
import { listFilterOptions, markThreadRead, listAllActiveExercises } from '../../lib/notes'
import NotesFilters from './NotesFilters'
import NoteCard from './NoteCard'
import NoteComposer from './NoteComposer'

const FILTER_REFETCH_DEBOUNCE_MS = 1500

export default function NotesPanel({ threadId, viewerRole = 'coach', authorId }) {
  const [filters, setFilters] = useState({})
  const [availableTags, setAvailableTags] = useState([])
  const [exercises, setExercises] = useState([])
  const [availableMuscleGroups, setAvailableMuscleGroups] = useState([])
  const [availableBlockTypes, setAvailableBlockTypes] = useState([])
  const [replyingTo, setReplyingTo] = useState(null)
  const [catalogExercises, setCatalogExercises] = useState([])

  // Carga del catálogo completo (lo necesita el composer para que el
  // coach pueda comentar sobre cualquier ejercicio, no solo los ya
  // presentes en el thread).
  useEffect(() => {
    let alive = true
    listAllActiveExercises().then(({ data }) => {
      if (alive) setCatalogExercises(data || [])
    })
    return () => { alive = false }
  }, [])

  // ── fetchOpts en ref para invocarlo desde realtime sin re-armar useEffect ──
  const fetchOptsRef = useRef(null)
  useEffect(() => {
    let alive = true
    fetchOptsRef.current = async () => {
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
    // primera carga
    fetchOptsRef.current()
    return () => { alive = false }
  }, [threadId])

  // ── D4: cuando llega un INSERT por realtime, re-fetch debounced de las
  // opciones de filtros (puede haber un ejercicio / tag nuevo). ──
  const refetchTimerRef = useRef(null)
  const handleNoteCreated = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => {
      fetchOptsRef.current?.()
    }, FILTER_REFETCH_DEBOUNCE_MS)
  }, [])
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [])

  // ── Hook principal de notas (con realtime) ────────────────────
  const { notes, loading, error, hasMore, loadMore, reload, unreadIds, unreadCount } = useNotes({
    threadId,
    filters,
    viewerRole,
    onNoteCreated: handleNoteCreated,
  })

  // ── Snapshot de no-leídas al primer render ──────────────────────
  const initialUnreadRef = useRef(new Set())
  useEffect(() => {
    for (const id of unreadIds) initialUnreadRef.current.add(id)
  }, [unreadIds])
  useEffect(() => {
    initialUnreadRef.current = new Set()
  }, [threadId])

  // ── Mark as read on mount (después de 1.5s) ─────────────────────
  const hasMarkedRef = useRef(false)
  useEffect(() => {
    hasMarkedRef.current = false
  }, [threadId])
  useEffect(() => {
    if (!threadId || notes.length === 0 || hasMarkedRef.current) return
    if (unreadCount === 0) return
    const t = setTimeout(async () => {
      hasMarkedRef.current = true
      await markThreadRead(threadId, viewerRole)
    }, 1500)
    return () => clearTimeout(t)
  }, [threadId, notes.length, unreadCount, viewerRole])

  // ── Mapa id → ejercicio (para resolver contexto en NoteCard) ──
  const exercisesMap = useMemo(() => {
    const m = new Map()
    for (const ex of exercises) m.set(ex.id, ex)
    return m
  }, [exercises])

  // ── Lista de grupos musculares para el composer: unión de los
  // grupos presentes en el thread (filtro de notas existentes) +
  // todos los grupos del catálogo (para poder estrenar uno). ──
  const composerMuscleGroups = useMemo(() => {
    const set = new Set(availableMuscleGroups || [])
    for (const ex of catalogExercises) {
      if (ex.muscle_group) set.add(ex.muscle_group)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [availableMuscleGroups, catalogExercises])

  // ── Mapa id → nota (para resolver parent en replies) ──────────
  const notesById = useMemo(() => {
    const m = new Map()
    for (const n of notes) m.set(n.id, n)
    return m
  }, [notes])

  // Callback: click en tag agrega al filtro
  const handleTagClick = useCallback((tag) => {
    setFilters(prev => {
      const current = Array.isArray(prev.tags) ? prev.tags : []
      if (current.includes(tag)) return prev
      return { ...prev, tags: [...current, tag] }
    })
  }, [])

  // Callback: click en "Responder" en un NoteCard
  const handleReply = useCallback((note) => {
    setReplyingTo(note)
  }, [])

  // Callback: tras crear una nota, scrolleamos arriba (lista DESC).
  // No tocamos `notes` manualmente: realtime ya va a traer el INSERT.
  const handleNoteSent = useCallback(() => {
    // No-op por ahora; podríamos hacer scrollIntoView si fuese necesario.
  }, [])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Banner contador de no leídas */}
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
              {viewerRole === 'coach'
                ? 'Todavía no se intercambiaron notas con este alumno.'
                : 'Todavía no hay notas en este hilo.'}
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
            onReply={handleReply}
            currentUserId={authorId}
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

      {/* Composer (Fase B / B+ / B++) */}
      <NoteComposer
        threadId={threadId}
        authorId={authorId}
        authorRole={viewerRole}
        parentNote={replyingTo}
        allExercises={catalogExercises}
        allMuscleGroups={composerMuscleGroups}
        defaultExerciseId={filters.exerciseId}
        defaultMuscleGroup={filters.muscleGroup}
        onCancelReply={() => setReplyingTo(null)}
        onCreated={handleNoteSent}
      />
    </div>
  )
}
