/**
 * NoteCard
 *
 * Renderiza una nota individual al estilo chat:
 *   - Coach: alineado a la derecha
 *   - Alumno: alineado a la izquierda
 *
 * Soporta replies de 1 nivel (parent_note_id renderizado como
 * "cita" arriba del cuerpo, si se pasa `parentNote`).
 *
 * Props:
 *   note          objeto nota (ver lib/notes.js)
 *   parentNote    objeto nota padre (opcional, para mostrar quote)
 *   exercisesMap  Map<id, exercise> para resolver nombres
 *   onTagClick    (tag) => void — clickear un tag agrega al filtro
 */

import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Lock, Tag, MessageSquare, CornerDownRight } from 'lucide-react'
import { contextTypeLabel } from '../../lib/notes'

// ── Etiquetas de muscle group / block type (mínimas) ─────────
const BLOCK_TYPE_LABELS = {
  strength: 'Fuerza',
  aerobic: 'Aeróbico',
  circuit: 'Circuito',
}

function safeDate(iso) {
  if (!iso) return null
  try {
    return parseISO(iso)
  } catch {
    return null
  }
}

function buildContextLabel(note, exercisesMap) {
  if (!note?.context_type || note.context_type === 'free') return null
  const baseLabel = contextTypeLabel(note.context_type)

  // Si hay exercise_id resuelto vía map, mostrar nombre
  if (note.exercise_id && exercisesMap?.get?.(note.exercise_id)) {
    const ex = exercisesMap.get(note.exercise_id)
    return `${baseLabel}: ${ex.name}`
  }

  // Caso bloque con block_type
  if (note.context_type === 'workout_block_log' && note.block_type) {
    return `${baseLabel}: ${BLOCK_TYPE_LABELS[note.block_type] || note.block_type}`
  }

  return baseLabel
}

export default function NoteCard({ note, parentNote, exercisesMap, onTagClick }) {
  if (!note) return null

  const isCoach = note.author_role === 'coach'
  const isPrivate = note.visibility === 'coach_private'
  const dateObj = safeDate(note.created_at)
  const relativeTime = dateObj
    ? formatDistanceToNow(dateObj, { addSuffix: true, locale: es })
    : ''
  const fullDate = dateObj ? format(dateObj, "d 'de' MMMM yyyy, HH:mm", { locale: es }) : ''

  const contextLabel = buildContextLabel(note, exercisesMap)
  const tags = Array.isArray(note.tags) ? note.tags : []

  // Estilos de burbuja (chat) — planos, sin gradientes
  const bubbleClass = isCoach
    ? 'bg-primary-50 border-primary-100 text-gray-900'
    : 'bg-white border-gray-200 text-gray-900'

  const alignmentClass = isCoach ? 'items-end' : 'items-start'
  const metaAlignment = isCoach ? 'justify-end' : 'justify-start'

  return (
    <div className={`flex flex-col ${alignmentClass} gap-1`}>
      {/* Burbuja */}
      <div
        className={`max-w-[88%] sm:max-w-[80%] border rounded-2xl px-3.5 py-2.5 ${bubbleClass}`}
      >
        {/* ── Header: rol + privada + contexto ── */}
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
        </div>

        {/* ── Quote del padre (replies de 1 nivel) ── */}
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

        {/* ── Body ── */}
        <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>

        {/* ── Tags ── */}
        {tags.length > 0 && (
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

      {/* ── Hora (debajo de la burbuja) ── */}
      <span
        className="text-[10px] text-gray-400 px-1"
        title={fullDate}
      >
        {relativeTime}
      </span>
    </div>
  )
}

// Ícono auxiliar reusable (por si en el futuro hace falta un placeholder
// de "sin notas" desde el card mismo).
export function NoteCardEmptyIcon(props) {
  return <MessageSquare {...props} />
}
