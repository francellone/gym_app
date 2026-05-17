/**
 * NoteCard (Fase C+)
 *
 * Renderiza una nota individual al estilo chat.
 *
 * Capacidades:
 *   - Replies de 1 nivel (quote del padre).
 *   - Botón "Responder" si llega onReply.
 *   - Menú "…" con Editar / Borrar para notas propias y NO espejadas
 *     desde campos legacy. Las notas mirror (context_type ∈
 *     {workout_log, workout_block_log, evaluation_test, plan_exercise})
 *     son read-only desde el panel — para cambiarlas hay que editar
 *     la fuente (TodayWorkoutPage, EvalWorkout, etc.). Para Fase D
 *     esto se va a unificar.
 *   - Inline edit con Save / Cancel.
 *   - Borrado con confirmación.
 *
 * Props:
 *   note          objeto nota (ver lib/notes.js)
 *   parentNote    objeto nota padre (opcional, para mostrar quote)
 *   exercisesMap  Map<id, exercise> para resolver nombres
 *   onTagClick    (tag) => void
 *   isUnread      bool
 *   onReply       (note) => void
 *   currentUserId string  — auth.uid() del viewer, para chequear "propia"
 */

import { useState, useRef, useEffect } from 'react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Lock, Tag, MessageSquare, CornerDownRight, Reply,
  MoreVertical, Edit2, Trash2, Check, X, Loader2
} from 'lucide-react'
import { contextTypeLabel, editNote, deleteNote } from '../../lib/notes'

const BLOCK_TYPE_LABELS = {
  strength: 'Fuerza',
  aerobic: 'Aeróbico',
  circuit: 'Circuito',
}

// Notas que pueden editarse/borrarse desde el panel:
//   - free / exercise: panel-authored, UPDATE directo en notes.
//   - workout_log / workout_block_log: mirrors, routeamos al campo
//     legacy y el trigger v25e re-sincroniza el mirror in-place.
//   - evaluation_test: routeamos a la columna correspondiente de
//     evaluation_test_responses (post v26c).
//   - plan / session_day: read-only (no se crean desde UI).
const EDITABLE_CONTEXTS = new Set([
  'free', 'exercise', 'workout_log', 'workout_block_log', 'evaluation_test',
])

function safeDate(iso) {
  if (!iso) return null
  try { return parseISO(iso) } catch { return null }
}

// Convierte 'YYYY-MM-DD' a 'DD/MM/YYYY' (read-only display)
function prettyDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = String(isoDate).split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

function buildContextLabel(note, exercisesMap) {
  // Free + note_date: mostrar etiqueta "Día"
  if (note?.context_type === 'free' && note?.note_date) {
    return `Día: ${prettyDate(note.note_date)}`
  }
  // Free + muscle_group (sin exercise): mostrar grupo muscular
  if (note?.context_type === 'free' && note?.muscle_group && !note?.exercise_id) {
    return `Grupo: ${note.muscle_group}`
  }
  if (!note?.context_type || note.context_type === 'free') return null
  const baseLabel = contextTypeLabel(note.context_type)
  if (note.exercise_id && exercisesMap?.get?.(note.exercise_id)) {
    const ex = exercisesMap.get(note.exercise_id)
    return `${baseLabel}: ${ex.name}`
  }
  if (note.context_type === 'workout_block_log' && note.block_type) {
    return `${baseLabel}: ${BLOCK_TYPE_LABELS[note.block_type] || note.block_type}`
  }
  return baseLabel
}

// Se considera "editada" si updated_at supera a created_at por >2s
// (margen para no falsear con triggers que tocan updated_at).
function wasEdited(note) {
  const c = safeDate(note.created_at)
  const u = safeDate(note.updated_at)
  if (!c || !u) return false
  return u.getTime() - c.getTime() > 2000
}

export default function NoteCard({
  note,
  parentNote,
  exercisesMap,
  onTagClick,
  isUnread = false,
  onReply,
  currentUserId,
}) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const editTextareaRef = useRef(null)

  // Cerrar menú al click afuera
  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // Autofoco al entrar en modo edición
  useEffect(() => {
    if (editing) {
      editTextareaRef.current?.focus()
      // Cursor al final
      const el = editTextareaRef.current
      if (el) {
        const v = el.value
        el.setSelectionRange(v.length, v.length)
      }
    }
  }, [editing])

  if (!note) return null

  const isCoach = note.author_role === 'coach'
  const isPrivate = note.visibility === 'coach_private'
  const dateObj = safeDate(note.created_at)
  const relativeTime = dateObj ? formatDistanceToNow(dateObj, { addSuffix: true, locale: es }) : ''
  const fullDate = dateObj ? format(dateObj, "d 'de' MMMM yyyy, HH:mm", { locale: es }) : ''

  const contextLabel = buildContextLabel(note, exercisesMap)
  const tags = Array.isArray(note.tags) ? note.tags : []
  const edited = wasEdited(note)

  // ── ¿Mostrar menú de edición/borrado? ──
  // Solo si:
  //   1) el viewer es el autor (currentUserId === note.author_id)
  //   2) el context_type permite edición desde el panel (panel-authored
  //      o mirror con routing soportado).
  const isOwn = !!currentUserId && note.author_id === currentUserId
  const isEditable = EDITABLE_CONTEXTS.has(note.context_type)
  const canEditOrDelete = isOwn && isEditable && !note.deleted_at

  const bubbleClass = isCoach
    ? `bg-primary-50 text-gray-900 ${isUnread ? 'border-2 border-primary-300' : 'border border-primary-100'}`
    : `bg-white text-gray-900 ${isUnread ? 'border-2 border-orange-300' : 'border border-gray-200'}`

  const alignmentClass = isCoach ? 'items-end' : 'items-start'
  const metaAlignment = isCoach ? 'justify-end' : 'justify-start'

  // ── Handlers de edición ──
  function startEdit() {
    setEditBody(note.body || '')
    setEditing(true)
    setMenuOpen(false)
    setError(null)
  }
  function cancelEdit() {
    setEditing(false)
    setEditBody('')
    setError(null)
  }
  async function saveEdit() {
    const clean = editBody.trim()
    if (!clean) {
      setError({ message: 'La nota no puede estar vacía.' })
      return
    }
    if (clean === note.body) {
      cancelEdit()
      return
    }
    setSaving(true)
    setError(null)
    // editNote rutea automáticamente: panel-authored → UPDATE notes;
    // mirror legacy (workout_log) → UPDATE en la fuente, trigger v25e
    // upsertea el mirror preservando el id de la nota.
    const { error: err } = await editNote(note, { body: clean })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    cancelEdit()
    // El UPDATE llega por realtime y refresca el render automáticamente.
  }
  async function handleDelete() {
    setMenuOpen(false)
    const ok = window.confirm('¿Borrar esta nota? Esta acción no se puede deshacer.')
    if (!ok) return
    const { error: err } = await deleteNote(note)
    if (err) {
      setError(err)
    }
    // La nota desaparece via realtime soft-delete handler en useNotes.
  }
  function handleEditKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  return (
    <div className={`flex flex-col ${alignmentClass} gap-1`}>
      <div className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 relative ${bubbleClass}`}>
        {isUnread && (
          <span
            className={`absolute -top-1 ${isCoach ? '-left-1' : '-right-1'} w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-white`}
            aria-label="Sin leer"
            title="Sin leer"
          />
        )}

        {/* ── Header: rol + privada + contexto + menú ── */}
        <div className={`flex items-center gap-1.5 flex-wrap mb-1 ${metaAlignment}`}>
          <span className="text-[11px] font-semibold text-gray-500">
            {isCoach ? 'Coach' : 'Alumno'}
          </span>
          {isPrivate && (
            <span className="badge bg-gray-200 text-gray-700 text-[10px] flex items-center gap-1">
              <Lock size={10} /> Privada
            </span>
          )}
          {contextLabel && (
            <span className="badge bg-blue-100 text-blue-700 text-[10px] truncate max-w-[180px]">
              {contextLabel}
            </span>
          )}

          {/* Menú "…" para edición/borrado (solo notas propias panel-authored) */}
          {canEditOrDelete && !editing && (
            <div className="relative ml-auto" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                aria-label="Acciones"
              >
                <MoreVertical size={13} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  <button
                    type="button"
                    onClick={startEdit}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"
                  >
                    <Edit2 size={12} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-red-50 flex items-center gap-1.5 text-red-600 border-t border-gray-100"
                  >
                    <Trash2 size={12} /> Borrar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Quote del padre ── */}
        {note.parent_note_id && (
          <div className="mb-1.5 pl-2 border-l-2 border-gray-300 text-xs text-gray-500 italic">
            <div className="flex items-center gap-1 mb-0.5 text-gray-400">
              <CornerDownRight size={11} />
              <span className="text-[10px] uppercase tracking-wide">En respuesta a</span>
            </div>
            <p className="line-clamp-2">
              {parentNote
                ? (() => {
                    const txt = parentNote.body || ''
                    return txt.length > 140 ? `${txt.slice(0, 140).trimEnd()}…` : txt
                  })()
                : <span className="text-gray-400">Mensaje eliminado</span>}
            </p>
          </div>
        )}

        {/* ── Body o textarea de edición ── */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={editTextareaRef}
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="input text-sm resize-none w-full"
              rows={Math.max(2, Math.min(8, (editBody.match(/\n/g) || []).length + 2))}
              disabled={saving}
            />
            {error && (
              <p className="text-[11px] text-red-600">{error.message || 'No se pudo actualizar.'}</p>
            )}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={cancelEdit}
                className="text-[11px] text-gray-500 hover:text-gray-700 inline-flex items-center gap-0.5 font-medium px-2 py-1"
                disabled={saving}
              >
                <X size={11} /> Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || !editBody.trim()}
                className="text-[11px] inline-flex items-center gap-0.5 font-semibold px-2 py-1 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Guardar
              </button>
            </div>
            <p className="text-[10px] text-gray-400">Cmd/Ctrl + Enter para guardar · Esc para cancelar</p>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
        )}

        {/* ── Tags ── */}
        {tags.length > 0 && !editing && (
          <div className={`flex flex-wrap gap-1 mt-2 ${metaAlignment}`}>
            {tags.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTagClick?.(t)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium hover:bg-gray-200 transition-colors"
              >
                <Tag size={9} />
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Hora + responder + edited (debajo de la burbuja) ── */}
      <div className={`flex items-center gap-2 px-1 ${metaAlignment}`}>
        {onReply && !note.deleted_at && !editing && (
          <button
            type="button"
            onClick={() => onReply(note)}
            className="text-[10px] text-gray-400 hover:text-primary-600 flex items-center gap-0.5 font-medium"
          >
            <Reply size={10} /> Responder
          </button>
        )}
        <span
          className="text-[10px] text-gray-400"
          title={fullDate}
        >
          {relativeTime}
          {edited && <span className="ml-1 italic">· editada</span>}
        </span>
      </div>
    </div>
  )
}

export function NoteCardEmptyIcon(props) {
  return <MessageSquare {...props} />
}
