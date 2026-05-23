// ============================================================
// ExerciseChatDrawer — Q1 drawer del chat completo del ejercicio
// ------------------------------------------------------------
// Modal lateral / bottom-sheet que renderiza el thread completo
// del ejercicio (notas coach + alumno) en el flow workout.
//
// Read-only V1 (decisión Franco 23/05 late night). Si Anto pide
// composer, se agrega en V2 reusando `<NoteComposer />`.
//
// Reusa `<NoteCard />` del feature de notes para mantener el
// estilo del chat consistente con el panel global.
//
// Props:
//   open             bool
//   onClose          () => void
//   exerciseId       uuid — para filtrar notas
//   exerciseName     string — para el título del header
//   threadId         uuid del thread del alumno (resuelto en TodayWorkoutPage)
//   currentUserId    uuid del viewer — para el chequeo "propia" en NoteCard
//   coachName        string opcional — header amistoso ("Tu coach: Anto")
//   notesCache       Map<exercise_id, Note[]> | null — prefetched si lo
//                    tenemos del padre, sino el drawer hace fetch lazy.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { X, MessageCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NoteCard from '@/features/notes/components/NoteCard'

export default function ExerciseChatDrawer({
  open,
  onClose,
  exerciseId,
  exerciseName,
  threadId,
  currentUserId,
  coachName,
  notesCache = null,
}) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState([])
  const [error, setError] = useState(null)

  // ── Fetch / cache ──
  // Si el padre ya pasó `notesCache`, usamos las notas pre-cargadas.
  // Sino, hacemos un fetch lazy al abrir.
  useEffect(() => {
    if (!open || !threadId || !exerciseId) return

    // Si el cache trae las notas para este ejercicio, usarlas
    if (notesCache && notesCache.has(exerciseId)) {
      setNotes(notesCache.get(exerciseId))
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data, error: err } = await supabase
        .from('notes')
        .select(
          'id, thread_id, author_id, author_role, body, visibility, context_type, context_id, exercise_id, muscle_group, block_type, parent_note_id, tags, note_date, created_at, updated_at, deleted_at'
        )
        .eq('thread_id', threadId)
        .eq('context_type', 'exercise')
        .eq('exercise_id', exerciseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (cancelled) return
      if (err) {
        setError(err.message || 'No se pudo cargar el chat.')
        setNotes([])
      } else {
        setNotes(data || [])
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, threadId, exerciseId, notesCache])

  // Mapa de ejercicios para que NoteCard pueda renderizar la chip
  // "Ejercicio: <nombre>" si quisiera. En este drawer todas las
  // notas pertenecen al mismo ejercicio, así que pasamos un mapa con
  // solo este.
  const exercisesMap = useMemo(() => {
    if (!exerciseId || !exerciseName) return new Map()
    return new Map([[exerciseId, { id: exerciseId, name: exerciseName }]])
  }, [exerciseId, exerciseName])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat del ejercicio ${exerciseName || ''}`}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[90vh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={16} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">
              {exerciseName || 'Chat del ejercicio'}
            </p>
            {coachName && (
              <p className="text-[11px] text-gray-500 truncate">Con {coachName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — lista de notas */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/40">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="text-primary-500 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-6 text-xs text-red-600">
              No pudimos cargar el chat. Probá cerrar y abrir de nuevo.
              <p className="mt-1 text-[10px] text-red-500/70">{error}</p>
            </div>
          )}

          {!loading && !error && notes.length === 0 && (
            <div className="text-center py-12 text-xs text-gray-400">
              Todavía no hay mensajes sobre este ejercicio.
            </div>
          )}

          {!loading && !error && notes.length > 0 && (
            <>
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  exercisesMap={exercisesMap}
                  currentUserId={currentUserId}
                  // V1 read-only: no `onReply` ni `onDeleted`.
                />
              ))}
            </>
          )}
        </div>

        {/* Footer placeholder — V2 podría sumar composer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-white text-[11px] text-gray-400 text-center flex-shrink-0">
          Para responder, abrí el panel de Notas desde el menú.
        </div>
      </div>
    </div>
  )
}
