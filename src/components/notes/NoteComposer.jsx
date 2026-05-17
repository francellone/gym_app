/**
 * NoteComposer
 *
 * Composer para escribir notas desde el panel (Fase B + B+).
 *
 * Soporta:
 *   - Body con textarea autosize
 *   - Visibility toggle (solo para coach: Compartida | Privada)
 *   - Tags como chips (agregar con Enter, eliminar con X)
 *     + picker desplegable con todos los tags existentes en el thread
 *   - Context picker (Fase B+): adjuntar la nota a un ejercicio del
 *     catálogo (context_type='exercise'). Si llega `defaultExerciseId`
 *     (típicamente desde el filtro activo del panel), se preselecciona.
 *   - Modo reply: si parentNote viene seteado, muestra quote y hereda
 *     context_type / context_id / visibility del padre.
 *
 * Props:
 *   threadId          string
 *   authorId          string
 *   authorRole        'coach' | 'student'
 *   parentNote        objeto note (opcional) — activa modo reply
 *   availableTags     string[] — tags ya presentes en el thread
 *   allExercises      Array<{id, name, muscle_group}> — catálogo completo
 *   defaultExerciseId string|null — preselección desde filtro del panel
 *   onCancelReply     () => void
 *   onCreated         (note) => void  — callback tras insert exitoso
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Send, Lock, Tag as TagIcon, X, CornerDownRight, Loader2,
  Paperclip, ChevronDown
} from 'lucide-react'
import { createNote, replyNote } from '../../lib/notes'

export default function NoteComposer({
  threadId,
  authorId,
  authorRole,
  parentNote = null,
  availableTags = [],
  allExercises = [],
  defaultExerciseId = null,
  onCancelReply,
  onCreated,
}) {
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('shared')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // ── Context picker state ──
  // attachedExerciseId: null = nota libre. uuid = adjuntada al ejercicio.
  const [attachedExerciseId, setAttachedExerciseId] = useState(null)
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false)
  const [exerciseQuery, setExerciseQuery] = useState('')

  const textareaRef = useRef(null)
  const isReply = !!parentNote
  const isCoach = authorRole === 'coach'
  const disabled = !threadId || !authorId || !authorRole || submitting

  // Preselección desde el filtro activo del panel. Se actualiza si el
  // usuario cambia de filtro mientras el composer está abierto, salvo
  // que ya haya escrito (no pisamos lo elegido manualmente).
  useEffect(() => {
    if (isReply) return // en reply el contexto se hereda del padre
    if (body.trim()) return // no pisar si el user ya está escribiendo
    setAttachedExerciseId(defaultExerciseId || null)
  }, [defaultExerciseId, isReply]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setAttachedExerciseId(defaultExerciseId || null)
    setTagPickerOpen(false)
    setExercisePickerOpen(false)
    setExerciseQuery('')
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

    // Si hay un tag a medio escribir, lo agregamos antes de enviar
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
      // Reply hereda context_type / context_id / visibility del padre
      res = await replyNote(parentNote.id, payload)
    } else if (attachedExerciseId) {
      // Nota adjuntada a un ejercicio del catálogo (v25b)
      res = await createNote({
        ...payload,
        threadId,
        contextType: 'exercise',
        contextId: attachedExerciseId,
      })
    } else {
      // Nota libre
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

  // ── Sugerencias de ejercicios filtradas ──
  const exerciseSuggestions = useMemo(() => {
    if (!exerciseQuery.trim()) return allExercises.slice(0, 20)
    const q = exerciseQuery.trim().toLowerCase()
    return allExercises
      .filter(ex =>
        ex.name?.toLowerCase().includes(q) ||
        ex.muscle_group?.toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [exerciseQuery, allExercises])

  const attachedExercise = attachedExerciseId
    ? allExercises.find(ex => ex.id === attachedExerciseId)
    : null

  // ── Sugerencias de tags filtradas por lo que va escribiendo ──
  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return []
    return availableTags
      .filter(t => !tags.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 5)
  }, [tagInput, availableTags, tags])

  // Tags disponibles para el picker (los del thread que aún no agregué)
  const pickerTags = useMemo(
    () => availableTags.filter(t => !tags.includes(t)),
    [availableTags, tags]
  )

  // ── Render ───────────────────────────────────────────────────
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

      {/* ── Context picker (no aparece en reply: contexto heredado) ── */}
      {!isReply && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            Adjuntar a:
          </span>

          {attachedExercise ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
              <Paperclip size={10} />
              {attachedExercise.name}
              <button
                type="button"
                onClick={() => setAttachedExerciseId(null)}
                className="hover:text-blue-900"
                aria-label="Quitar ejercicio"
              >
                <X size={11} />
              </button>
            </span>
          ) : (
            <span className="text-xs text-gray-400">Sin contexto</span>
          )}

          <button
            type="button"
            onClick={() => setExercisePickerOpen(v => !v)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-0.5"
          >
            {attachedExercise ? 'Cambiar' : '+ Adjuntar ejercicio'}
            <ChevronDown size={11} className={exercisePickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      )}

      {/* ── Exercise picker desplegable ── */}
      {!isReply && exercisePickerOpen && (
        <div className="border border-gray-200 rounded-lg bg-white">
          <input
            type="text"
            value={exerciseQuery}
            onChange={e => setExerciseQuery(e.target.value)}
            placeholder="Buscar ejercicio…"
            className="input text-xs border-0 rounded-b-none focus:ring-0"
            autoFocus
          />
          <div className="max-h-44 overflow-y-auto border-t border-gray-100">
            {exerciseSuggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
            ) : (
              exerciseSuggestions.map(ex => (
                <button
                  type="button"
                  key={ex.id}
                  onClick={() => {
                    setAttachedExerciseId(ex.id)
                    setExercisePickerOpen(false)
                    setExerciseQuery('')
                  }}
                  className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">{ex.name}</span>
                    {ex.muscle_group && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {ex.muscle_group}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Textarea ── */}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleBodyChange}
        onKeyDown={handleKeyDown}
        placeholder={
          isReply
            ? 'Escribir tu respuesta…'
            : attachedExercise
              ? `Comentar sobre ${attachedExercise.name}…`
              : isCoach
                ? 'Escribir nota para el alumno…'
                : 'Escribir nota para tu coach…'
        }
        rows={2}
        className="input text-sm resize-none"
        style={{ minHeight: '60px' }}
        disabled={submitting}
      />

      {/* ── Tags chips actuales ── */}
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
        {/* Tag input + botón "Ver tags" */}
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
            className="input pl-7 pr-16 text-xs"
            disabled={submitting}
          />
          {pickerTags.length > 0 && (
            <button
              type="button"
              onClick={() => setTagPickerOpen(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-0.5"
            >
              Ver
              <ChevronDown size={10} className={tagPickerOpen ? 'rotate-180' : ''} />
            </button>
          )}

          {/* Sugerencias autocomplete (mientras escribís) */}
          {tagSuggestions.length > 0 && !tagPickerOpen && (
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

      {/* ── Tag picker: chips clickeables con todos los tags del thread ── */}
      {tagPickerOpen && pickerTags.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">
            Tags existentes en este hilo
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pickerTags.map(t => (
              <button
                type="button"
                key={t}
                onClick={() => {
                  addTag(t)
                  // No cerramos el picker — el coach quizás quiera agregar varios
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700"
              >
                <TagIcon size={9} />
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

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
