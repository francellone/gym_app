/**
 * NoteComposer (Fase B++)
 *
 * Composer con tres opciones de contexto:
 *   1. Observación general (context_type='free', sin denormalización)
 *   2. Ejercicio          (context_type='exercise', context_id=<exercise.id>)
 *   3. Grupo muscular     (context_type='free' + muscle_group manual,
 *                          el trigger v25c respeta lo enviado)
 *
 * En modo reply el contexto se hereda del padre y los tabs no aparecen.
 *
 * Removido en B++: input de tags (campo libre sin curaduría). Las notas
 * legacy con tags se siguen renderizando en NoteCard.
 *
 * Props:
 *   threadId              string
 *   authorId              string
 *   authorRole            'coach' | 'student'
 *   parentNote            objeto note — activa modo reply
 *   allExercises          Array<{id, name, muscle_group}>
 *   allMuscleGroups       string[] — opciones de grupo muscular disponibles
 *   defaultExerciseId     string|null — preselección desde filtro
 *   defaultMuscleGroup    string|null — preselección desde filtro
 *   onCancelReply         () => void
 *   onCreated             (note) => void
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Send,
  Lock,
  X,
  CornerDownRight,
  Loader2,
  Paperclip,
  ChevronDown,
  MessageCircle,
  Dumbbell,
  Layers,
  Calendar,
} from 'lucide-react'
import { createNote, replyNote } from '../api'

const CONTEXT_TABS = [
  { key: 'free', labelKey: 'notes.tabObservation', Icon: MessageCircle },
  { key: 'exercise', labelKey: 'notes.exercise', Icon: Dumbbell },
  { key: 'muscle_group', labelKey: 'notes.muscleGroup', Icon: Layers },
  { key: 'day', labelKey: 'workout.day', Icon: Calendar },
]

// Formatea Date → 'YYYY-MM-DD' en zona local (para que el date picker
// coincida con la percepción del usuario, no con UTC midnight)
function todayLocalIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function NoteComposer({
  threadId,
  authorId,
  authorRole,
  parentNote = null,
  allExercises = [],
  allMuscleGroups = [],
  defaultExerciseId = null,
  defaultMuscleGroup = null,
  onCancelReply,
  onCreated,
}) {
  const { t } = useTranslation()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('shared')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // ── Context state ──
  // tab: 'free' | 'exercise' | 'muscle_group' | 'day'
  const [contextTab, setContextTab] = useState('free')
  const [exerciseId, setExerciseId] = useState(null)
  const [muscleGroup, setMuscleGroup] = useState(null)
  const [noteDate, setNoteDate] = useState(null) // YYYY-MM-DD local

  // ── Pickers desplegables ──
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false)
  const [exerciseQuery, setExerciseQuery] = useState('')

  const textareaRef = useRef(null)
  const isReply = !!parentNote
  const isCoach = authorRole === 'coach'
  const disabled = !threadId || !authorId || !authorRole || submitting

  // Preselección desde filtros del panel (al primer mount, o al cambiar
  // filtros si todavía no escribió nada)
  useEffect(() => {
    if (isReply) return
    if (body.trim()) return
    if (defaultExerciseId) {
      setContextTab('exercise')
      setExerciseId(defaultExerciseId)
      setMuscleGroup(null)
    } else if (defaultMuscleGroup) {
      setContextTab('muscle_group')
      setMuscleGroup(defaultMuscleGroup)
      setExerciseId(null)
    } else {
      setContextTab('free')
      setExerciseId(null)
      setMuscleGroup(null)
    }
  }, [defaultExerciseId, defaultMuscleGroup, isReply]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function clearForm() {
    setBody('')
    setError(null)
    setVisibility('shared')
    setContextTab('free')
    setExerciseId(null)
    setMuscleGroup(null)
    setNoteDate(null)
    setExercisePickerOpen(false)
    setExerciseQuery('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function setTab(key) {
    setContextTab(key)
    // Limpieza cruzada: si paso a otra solapa, descarto valores no aplicables.
    if (key !== 'exercise') setExerciseId(null)
    if (key !== 'muscle_group') setMuscleGroup(null)
    if (key !== 'day') setNoteDate(null)
    setExercisePickerOpen(false)
    // Si elige Día y todavía no hay fecha, pre-seleccionamos hoy
    if (key === 'day' && !noteDate) setNoteDate(todayLocalIso())
  }

  async function handleSubmit() {
    if (disabled) return
    const clean = body.trim()
    if (!clean) {
      setError({ message: t('notes.emptyNoteError') })
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      body: clean,
      visibility,
      authorId,
      authorRole,
    }

    let res
    if (isReply) {
      // Reply: hereda context_type / context_id / visibility del padre
      res = await replyNote(parentNote.id, payload)
    } else if (contextTab === 'exercise' && exerciseId) {
      // Adjuntar a ejercicio del catálogo
      res = await createNote({
        ...payload,
        threadId,
        contextType: 'exercise',
        contextId: exerciseId,
      })
    } else if (contextTab === 'muscle_group' && muscleGroup) {
      // Free + muscle_group manual (v25c)
      res = await createNote({
        ...payload,
        threadId,
        contextType: 'free',
        contextId: null,
        muscleGroup,
      })
    } else if (contextTab === 'day' && noteDate) {
      // Free + note_date manual (v26b)
      res = await createNote({
        ...payload,
        threadId,
        contextType: 'free',
        contextId: null,
        noteDate,
      })
    } else {
      // Observación general libre
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
      .filter(
        (ex) => ex.name?.toLowerCase().includes(q) || ex.muscle_group?.toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [exerciseQuery, allExercises])

  const attachedExercise = exerciseId ? allExercises.find((ex) => ex.id === exerciseId) : null

  // Formato legible de fecha (para placeholder/header)
  function prettyDate(isoDate) {
    if (!isoDate) return ''
    const [y, m, d] = isoDate.split('-')
    return `${d}/${m}/${y}`
  }

  const placeholder = (() => {
    if (isReply) return t('notes.replyPlaceholder')
    if (contextTab === 'exercise' && attachedExercise)
      return t('notes.commentOnPlaceholder', { name: attachedExercise.name })
    if (contextTab === 'muscle_group' && muscleGroup)
      return t('notes.commentOnPlaceholder', { name: muscleGroup })
    if (contextTab === 'day' && noteDate)
      return t('notes.commentOnDayPlaceholder', { date: prettyDate(noteDate) })
    if (isCoach) return t('notes.noteForStudentPlaceholder')
    return t('notes.noteForCoachPlaceholder')
  })()

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="card space-y-2">
      {/* ── Modo reply: quote del padre ── */}
      {isReply && (
        <div className="flex items-start gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          <CornerDownRight size={12} className="flex-shrink-0 mt-0.5 text-gray-400" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
              {t('notes.replyingTo', {
                role:
                  parentNote.author_role === 'coach' ? t('notes.roleCoach') : t('notes.roleStudent'),
              })}
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
            aria-label={t('notes.cancelReplyAria')}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Tabs de contexto (oculto en reply: contexto heredado) ── */}
      {!isReply && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {CONTEXT_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTab(tab.key)}
              className={`flex-1 py-1.5 px-2 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                contextTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.Icon size={11} />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      )}

      {/* ── Selector según tab activo ── */}
      {!isReply && contextTab === 'exercise' && (
        <div>
          {attachedExercise ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                <Paperclip size={10} />
                {attachedExercise.name}
                {attachedExercise.muscle_group && (
                  <span className="text-blue-500/70 text-[10px]">
                    · {attachedExercise.muscle_group}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExerciseId(null)}
                  className="hover:text-blue-900"
                  aria-label={t('notes.removeExerciseAria')}
                >
                  <X size={11} />
                </button>
              </span>
              <button
                type="button"
                onClick={() => setExercisePickerOpen((v) => !v)}
                className="text-[11px] text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-0.5"
              >
                {t('notes.change')} <ChevronDown size={10} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExercisePickerOpen((v) => !v)}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1"
            >
              <Paperclip size={11} /> {t('notes.pickExercise')}
              <ChevronDown
                size={11}
                className={
                  exercisePickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'
                }
              />
            </button>
          )}

          {exercisePickerOpen && (
            <div className="border border-gray-200 rounded-lg bg-white mt-2">
              <input
                type="text"
                value={exerciseQuery}
                onChange={(e) => setExerciseQuery(e.target.value)}
                placeholder={t('notes.searchExercisePlaceholder')}
                className="input text-xs border-0 rounded-b-none focus:ring-0"
                autoFocus
              />
              <div className="max-h-44 overflow-y-auto border-t border-gray-100">
                {exerciseSuggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">{t('notes.noResults')}</p>
                ) : (
                  exerciseSuggestions.map((ex) => (
                    <button
                      type="button"
                      key={ex.id}
                      onClick={() => {
                        setExerciseId(ex.id)
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
        </div>
      )}

      {!isReply && contextTab === 'day' && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-500 inline-flex items-center gap-1">
            <Calendar size={11} /> {t('workout.day')}:
          </label>
          <input
            type="date"
            className="input text-xs py-1 px-2"
            style={{ width: 'auto' }}
            value={noteDate || ''}
            max={todayLocalIso()}
            onChange={(e) => setNoteDate(e.target.value || null)}
            disabled={submitting}
          />
          {noteDate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <Calendar size={10} />
              {prettyDate(noteDate)}
              <button
                type="button"
                onClick={() => setNoteDate(null)}
                className="hover:text-amber-900"
                aria-label={t('notes.removeDateAria')}
              >
                <X size={11} />
              </button>
            </span>
          )}
        </div>
      )}

      {!isReply && contextTab === 'muscle_group' && (
        <div>
          {muscleGroup ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                <Layers size={10} />
                {muscleGroup}
                <button
                  type="button"
                  onClick={() => setMuscleGroup(null)}
                  className="hover:text-green-900"
                  aria-label={t('notes.removeMuscleGroupAria')}
                >
                  <X size={11} />
                </button>
              </span>
              <span className="text-[11px] text-gray-400">{t('notes.changeByClicking')}</span>
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t('notes.pickMuscleGroup')}</p>
          )}

          {allMuscleGroups.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {allMuscleGroups.map((mg) => (
                <button
                  type="button"
                  key={mg}
                  onClick={() => setMuscleGroup(mg)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                    muscleGroup === mg
                      ? 'bg-green-100 text-green-700 border-green-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {mg}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 mt-1">{t('notes.noMuscleGroups')}</p>
          )}
        </div>
      )}

      {/* ── Textarea ── */}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleBodyChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className="input text-sm resize-none"
        style={{ minHeight: '60px' }}
        disabled={submitting}
      />

      {/* ── Visibility toggle + submit ── */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {isCoach && !isReply && (
          <button
            type="button"
            onClick={() => setVisibility((v) => (v === 'shared' ? 'coach_private' : 'shared'))}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
              visibility === 'coach_private'
                ? 'bg-gray-700 text-white border-gray-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            title={
              visibility === 'coach_private' ? t('notes.privateTooltip') : t('notes.sharedTooltip')
            }
            disabled={submitting}
          >
            {visibility === 'coach_private' ? <Lock size={11} /> : null}
            {visibility === 'coach_private' ? t('notes.private') : t('notes.shared')}
          </button>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !body.trim()}
          className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {isReply ? t('notes.reply') : t('notes.send')}
        </button>
      </div>

      {/* ── Error inline ── */}
      {error && (
        <p className="text-xs text-red-600">{error.message || t('notes.sendFailed')}</p>
      )}

      {!error && (
        <p className="text-[10px] text-gray-400 text-right">{t('notes.sendShortcut')}</p>
      )}
    </div>
  )
}
