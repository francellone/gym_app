import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MessageCircle, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { CircleIcon } from '@/components/icons/SegmentIcon'

// ============================================================
// Notas de un registro: qué se ve primero + conversación completa
// ------------------------------------------------------------
// Regla (2026-10-04, ver notePreview.js): primero la última nota del
// otro; si no hay, la última propia. Siempre con quién la escribió y,
// si hay más de una, un "+N" que invita a abrir la conversación.
// Los datos vienen de attachNoteThreads: log.notePreview + log.noteThread.
// ============================================================

// "Vos" / "Coach" / "Persona", desde el punto de vista de quien mira.
export function noteAuthorLabel(note, t) {
  if (!note) return ''
  if (note.mine) return t('notes.preview.you')
  return note.authorRole === 'coach' ? t('notes.preview.coach') : t('notes.preview.person')
}

// "Persona: Me resbalo  +1"
export function NotePreviewText({ preview, fallback = null, className = '' }) {
  const { t } = useTranslation()
  if (!preview) return fallback ? <span className={className}>"{fallback}"</span> : null
  const more = preview.total - 1
  return (
    <span className={className}>
      <span className="not-italic font-semibold text-texto2">{noteAuthorLabel(preview, t)}:</span>{' '}
      {preview.body}
      {more > 0 && (
        <span className="not-italic ml-1.5 inline-block rounded-full bg-primary-50 text-primary-700 px-1.5 text-[10px] font-semibold align-middle">
          +{more}
        </span>
      )}
    </span>
  )
}

export function NoteThreadModal({ thread, fallback = null, onClose }) {
  const { t } = useTranslation()
  const items =
    thread && thread.length > 0 ? thread : fallback ? [{ id: 'legacy', body: fallback }] : []
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="absolute inset-0 bg-velo/15" />
      <div
        className="relative bg-white shadow-2xl rounded-2xl p-4 max-w-sm w-full border border-gray-100 max-h-[80vh] flex flex-col"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <CircleIcon icon={MessageCircle} segment="messages" size="md" />
          <p className="text-sm font-semibold text-tinta flex-1">
            {t('notes.preview.threadTitle', { count: items.length })}
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-2 overflow-y-auto">
          {items.map((n) => (
            <li
              key={n.id}
              className={[
                'rounded-xl px-3 py-2 text-sm leading-relaxed',
                n.mine ? 'bg-gray-50 ml-6' : 'bg-primary-50 mr-6',
              ].join(' ')}
            >
              {n.authorRole && (
                <p className="text-[11px] font-semibold text-texto2 mb-0.5">
                  {noteAuthorLabel(n, t)}
                  {n.createdAt && (
                    <span className="font-normal">
                      {' · '}
                      {format(parseISO(n.createdAt), 'dd/MM HH:mm')}
                    </span>
                  )}
                </p>
              )}
              <p className="text-gray-800 whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  )
}

// Línea de nota para listas (historial). Tocarla abre la conversación;
// no dispara el link de la fila que la contiene.
export default function NotePreviewLine({ log, className = '' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const preview = log?.notePreview || null
  const legacy = !preview && log?.notes && String(log.notes).trim() ? log.notes : null
  if (!preview && !legacy) return null
  return (
    <>
      <button
        type="button"
        className={`block w-full text-left text-xs text-gray-400 italic truncate hover:text-primary-600 ${className}`}
        title={
          preview && preview.total > 1
            ? t('notes.preview.seeAll', { count: preview.total })
            : t('notes.preview.seeNote')
        }
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <NotePreviewText preview={preview} fallback={legacy} />
      </button>
      {open && (
        <NoteThreadModal thread={log.noteThread} fallback={legacy} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
