/**
 * NoteComposer
 *
 * Composer para escribir notas desde el panel (Fase B).
 *
 * Soporta:
 *   - Body con textarea autosize
 *   - Visibility toggle (solo para coach: Compartida | Privada)
 *   - Tags como chips (agregar con Enter, eliminar con X)
 *   - Modo reply: si parentNote viene seteado, muestra quote y al
 *     enviar pasa parentNoteId + hereda context_type/context_id.
 *   - Cancel reply.
 *
 * Props:
 *   threadId        string
 *   authorId        string
 *   authorRole      'coach' | 'student'
 *   parentNote      objeto note (opcional) — activa modo reply
 *   availableTags   string[] — sugerencias para el input de tags
 *   onCancelReply   () => void
 *   onCreated       (note) => void  — callback tras insert exitoso
 */

import { useEffect, useRef, useState } from 'react'
import { Send, Lock, Tag as TagIcon, X, CornerDownRight, Loader2 } from 'lucide-react'
import { createNote, replyNote } from '../../lib/notes'

export default function NoteComposer({
  threadId,
  authorId,
  authorRole,
  parentNote = null,
  availableTags = [],
  onCancelReply,
  onCreated,
}) {
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('shared')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  const isReply = !!parentNote
  const isCoach = authorRole === 'coach'
  const disabled = !threadId || !authorId || !authorRole || submitting

  // Autofoco cuando se activa modo reply
  useEffect(() => {
    if (isReply) textareaRef.current?.focus()
  }, [isReply])

  // Autosize del textarea
  function handleBodyChange(e) {
    setBody(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }

  function addTag(raw) {
    const t = (raw || '').trim()
    if (!t) return
    if (tags.includes(t)) return
    setTags([...tags, t])
    setTagInput('')
  }

  function removeTag(t) {
    setTags(tags.filter(x => x !== t))
  }

  function clearForm() {
    setBody('')
    setTags([])
    setTagInput('')
    setError(null)
    setVisibility('shared')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  async function handleSubmit() {
    if (disabled) return
    const clean = body.trim()
    if (!clean) {
      setError({ message: 'La nota no puede estar vacía.' })
      return
    }

    setSubmitting(true)
    setError(null)

    // Si hay tag a medio escribir, lo agregamos antes de enviar
    const finalTags = tagInput.trim() && !tags.includes(tagInput.trim())
      ? [...tags, tagInput.trim()]
      : tags

    const payload = {
      body: clean,
      visibility,
      tags: finalTags,
      authorId,
      authorRole,
    }

    let res
    if (isReply) {
      res = await replyNote(parentNote.id, payload)
    } else {
      res = await createNote({
        ...payload,
        threadId,
        contextType: 'free',
        contextId: null,
      })
    }

    setSubmitting(false)

    if (res.error) {
      setError(res.error)
      return
    }

    clearForm()
    onCreated?.(res.data)
    if (isReply) onCancelReply?.()
  }

  function handleKeyDown(e) {
    // Cmd/Ctrl + Enter para enviar
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Sugerencias filtradas para el input de tags
  const tagSuggestions = (() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return []
    return availableTags
      .filter(t => !tags.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 5)
  })()

  return (
    <div className="card space-y-2">
      {/* ── Modo reply: quote del padre ── */}
      {isReply && (
        <div className="flex items-start gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          <CornerDownRight size={12} className="flex-shrink-0 mt-0.5 text-gray-400" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
              Respondiendo a {parentNote.author_role === 'coach' ? 'Coach' : 'Alumno'}
            </p>
            <p className="italic line-clamp-2">
              {(() => {
                const txt = parentNote.body || ''
                return txt.length > 140 ? `${txt.slice(0, 140).trimEnd()}…` : txt
              })()}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Cancelar respuesta"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Textarea ── */}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleBodyChange}
        onKeyDown={handleKeyDown}
        placeholder={
          isCoach
            ? 'Escribir nota para el alumno…'
            : 'Escribir nota para tu coach…'
        }
        rows={2}
        className="input text-sm resize-none"
        style={{ minHeight: '60px' }}
        disabled={submitting}
      />

      {/* ── Tags chips ── */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="hover:text-primary-900"
                aria-label={`Quitar tag ${t}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Tag input + visibility toggle + submit ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tag input */}
        <div className="relative flex-1 min-w-[140px]">
          <TagIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tagInput)
              } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                removeTag(tags[tags.length - 1])
              }
            }}
            placeholder="Tag…"
            className="input pl-7 text-xs"
            disabled={submitting}
          />
          {/* Sugerencias */}
          {tagSuggestions.length > 0 && (
            <div className="absolute left-0 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-xl shadow-md max-h-32 overflow-y-auto z-10">
              {tagSuggestions.map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => addTag(s)}
                  className="block w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Visibility toggle (solo coach, oculto en modo reply si heredamos) */}
        {isCoach && !isReply && (
          <button
            type="button"
            onClick={() => setVisibility(v => v === 'shared' ? 'coach_private' : 'shared')}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
              visibility === 'coach_private'
                ? 'bg-gray-700 text-white border-gray-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            title={visibility === 'coach_private' ? 'Solo vos la ves' : 'El alumno la va a ver'}
            disabled={submitting}
          >
            {visibility === 'coach_private' ? <Lock size={11} /> : null}
            {visibility === 'coach_private' ? 'Privada' : 'Compartida'}
          </button>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !body.trim()}
          className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? <Loader2 size={12} className="animate-spin" />
            : <Send size={12} />
          }
          {isReply ? 'Responder' : 'Enviar'}
        </button>
      </div>

      {/* ── Error inline ── */}
      {error && (
        <p className="text-xs text-red-600">
          {error.message || 'No se pudo enviar la nota.'}
        </p>
      )}

      {/* ── Hint shortcut ── */}
      {!error && (
        <p className="text-[10px] text-gray-400">
          Cmd/Ctrl + Enter para enviar
        </p>
      )}
    </div>
  )
}
