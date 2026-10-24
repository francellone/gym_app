// Conversación coach↔persona: mensajes, eventos y caja para escribir.
// La usan la sección Chat de la coach y el Chat de la persona.
// Simplificada 2026-10-22 (pedido de Franco): la coach tiene "Todo" y
// "Pendientes", la lupa y el filtro por ejercicio (tocando la etiqueta de un
// mensaje); la persona solo la conversación. Sin "Va a:": se responde con
// "Responder" y la coach escribe sobre un ejercicio con la pesa.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, MessagesSquare, Search, X, Dumbbell } from 'lucide-react'
import { createNote, replyNote, editNote, softDeleteNote } from '@/features/notes/api'
import { useChatThread } from '../useChatThread'
import {
  buildTimeline,
  localDateKey,
  pendingFor,
  pendingEvents,
  eventTarget,
  dayLetter,
  itemMatchesExercise,
  itemMatchesText,
  exercisesInTimeline,
  planExerciseGroups,
  firstPlanExerciseFor,
} from '../chatModel'
import { contextLabel, eventTitle } from '../chatText'
import { fetchCatalog, fetchActivePlans, unlinkNote, dismissReply, dismissEvent } from '../chatApi'
import ChatEventCard from './ChatEventCard'
import ChatMessage from './ChatMessage'
import ChatComposer from './ChatComposer'
import { ExercisePickerSheet, ChatSearchSheet } from './ChatSheets'

function useDateFormat() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'es-AR'
  const time = (iso) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const shortDate = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' })
  }
  const dayHeader = (key) => {
    const today = localDateKey(new Date())
    const yest = localDateKey(new Date(Date.now() - 86400000))
    if (key === today) return t('chat.today')
    if (key === yest) return t('chat.yesterday')
    const [y, m, d] = key.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const sameYear = y === new Date().getFullYear()
    return dt.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  }
  return { time, shortDate, dayHeader }
}

export default function ChatConversation({
  threadId,
  studentId,
  studentName,
  viewerRole,
  authorId,
  header,
}) {
  const { t, i18n } = useTranslation()
  const isCoach = viewerRole === 'coach'
  const { notes, events, wellbeing, labels, loading, error, reload, applyNote } = useChatThread({
    threadId,
    studentId,
    viewerRole,
  })
  const [filter, setFilter] = useState('all') // 'all' | 'pending' (coach)
  const [exerciseFilter, setExerciseFilter] = useState(null) // exercise_id
  const [textFilter, setTextFilter] = useState('')
  const [sheet, setSheet] = useState(null) // 'picker' | 'search'
  const [catalogNames, setCatalogNames] = useState(null)
  const [activePlans, setActivePlans] = useState([])
  const [actionError, setActionError] = useState(null)
  const [replyTo, setReplyTo] = useState(null) // nota o eventTarget
  // undefined = el que sugiere el filtro; null = sin ejercicio; objeto = elegido
  const [exChoice, setExChoice] = useState(undefined)
  const scrollRef = useRef(null)
  const stick = useRef(true)
  const fmt = useDateFormat()

  useEffect(() => {
    if (!isCoach) return
    let alive = true
    fetchCatalog().then(({ data }) => {
      if (!alive || !data) return
      setCatalogNames(new Map(data.map((e) => [e.id, e.name])))
    })
    return () => {
      alive = false
    }
  }, [isCoach])

  useEffect(() => {
    if (!isCoach || !studentId) return
    let alive = true
    fetchActivePlans(studentId).then(({ data }) => alive && setActivePlans(data || []))
    return () => {
      alive = false
    }
  }, [isCoach, studentId])

  // Cambiar de persona limpia filtros y destinos.
  useEffect(() => {
    setFilter('all')
    setExerciseFilter(null)
    setTextFilter('')
    setReplyTo(null)
    setExChoice(undefined)
  }, [threadId])

  const nameOf = useCallback(
    (id) => labels.exercises.get(id)?.name || catalogNames?.get(id) || '',
    [labels, catalogNames]
  )

  const timeline = useMemo(() => buildTimeline({ notes, events }), [notes, events])
  const pendingAll = useMemo(() => pendingFor(notes, viewerRole), [notes, viewerRole])
  const pendingIds = useMemo(() => new Set(pendingAll.map((n) => n.id)), [pendingAll])
  // Omisiones que piden respuesta (solo la coach las responde)
  const pendingEv = useMemo(
    () => (isCoach ? pendingEvents(events, notes) : []),
    [isCoach, events, notes]
  )
  const pendingEvIds = useMemo(() => new Set(pendingEv.map((e) => e.id)), [pendingEv])
  const pendingCount = pendingAll.length + pendingEv.length

  const visible = useMemo(() => {
    let items = timeline
    if (filter === 'pending') {
      items = items.filter(
        (it) =>
          (it.type === 'note' && pendingIds.has(it.id)) ||
          (it.type === 'event' && pendingEvIds.has(it.id))
      )
    }
    if (exerciseFilter) items = items.filter((it) => itemMatchesExercise(it, exerciseFilter))
    if (textFilter) items = items.filter((it) => itemMatchesText(it, textFilter))
    return items
  }, [timeline, filter, pendingIds, pendingEvIds, exerciseFilter, textFilter])
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  // v78: etiqueta de las respuestas a un evento ("Semana completa", "Mejor marca…")
  const labelsX = useMemo(() => {
    const byId = new Map(events.map((e) => [e.id, e]))
    return {
      ...labels,
      eventLabel: (id) => {
        const ev = byId.get(id)
        if (!ev) return null
        return eventTitle(t, ev, {
          viewerRole,
          name: studentName,
          exerciseName: ev.exercise_id ? labels.exercises.get(ev.exercise_id)?.name : null,
          lng: i18n.language,
        })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, events, viewerRole, studentName, t])
  const threadExercises = useMemo(() => exercisesInTimeline(timeline), [timeline])
  const groups = useMemo(() => planExerciseGroups(activePlans), [activePlans])

  // ── Sobre qué ejercicio va el próximo mensaje (solo coach) ──
  const suggestedEx = useMemo(
    () => (isCoach && exerciseFilter ? firstPlanExerciseFor(activePlans, exerciseFilter) : null),
    [isCoach, exerciseFilter, activePlans]
  )
  const exerciseTarget = replyTo ? null : exChoice === undefined ? suggestedEx : exChoice
  const exerciseTargetView = exerciseTarget
    ? {
        name: nameOf(exerciseTarget.pe.exercise_id),
        dayLabel: dayLetter(exerciseTarget.section)
          ? t('chat.dayShort', { day: dayLetter(exerciseTarget.section) })
          : '',
      }
    : null

  function chooseReply(target) {
    setReplyTo(target)
  }

  function filterByExercise(id) {
    setExerciseFilter(id)
    setFilter('all')
    setExChoice(undefined)
  }

  const labelOf = useCallback(
    (n) =>
      n?.isEvent
        ? eventTitle(t, n.event, { viewerRole, name: studentName, lng: i18n.language })
        : contextLabel(t, n, labelsX, fmt.shortDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, labelsX, viewerRole, studentName]
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [visible.length, loading, wellbeing])

  useEffect(() => {
    stick.current = true
  }, [threadId, filter, exerciseFilter, textFilter])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function handleSend(body) {
    setActionError(null)
    stick.current = true
    const res = replyTo?.isEvent
      ? await createNote({
          threadId,
          body,
          authorId,
          authorRole: viewerRole,
          contextType: replyTo.context_type,
          contextId: replyTo.context_id,
        })
      : replyTo
        ? await replyNote(replyTo.id, { body, authorId, authorRole: viewerRole })
        : exerciseTarget
          ? await createNote({
              threadId,
              body,
              authorId,
              authorRole: viewerRole,
              contextType: 'plan_exercise',
              contextId: exerciseTarget.pe.id,
            })
          : await createNote({ threadId, body, authorId, authorRole: viewerRole })
    if (res.error) {
      setActionError(res.error.message || t('chat.sendError'))
      return false
    }
    applyNote(res.data)
    setReplyTo(null)
    // El ejercicio elegido a mano queda puesto para el próximo mensaje solo si
    // se está filtrando por él; si no, vuelve a suelto.
    if (!exerciseFilter) setExChoice(undefined)
    return true
  }

  async function handleAction(kind, note, extra = {}) {
    setActionError(null)
    if (kind === 'delete') {
      const { error: err } = await softDeleteNote(note.id)
      if (err) {
        setActionError(t('chat.delete.error'))
        return
      }
      if (extra.withCopies && isCoach) {
        const copies = notes.filter((n) => n.source_note_id === note.id && !n.deleted_at)
        for (const c of copies) await unlinkNote(c.id)
      }
      if (replyTo?.id === note.id) setReplyTo(null)
      applyNote({ ...note, deleted_at: new Date().toISOString() })
      reload()
      return
    }
    if (kind === 'reply') {
      chooseReply(note)
      return
    }
    if (kind === 'dismiss' || kind === 'undismiss') {
      const { error: err } = await dismissReply(note.id, kind === 'dismiss')
      if (err) setActionError(t('chat.sheet.saveError'))
      reload()
    }
  }

  async function handleUnlink(copy) {
    const { error: err } = await unlinkNote(copy.id)
    if (err) setActionError(t('chat.link.removeError'))
    reload()
  }

  async function handleEdit(note, body) {
    const { data, error: err } = await editNote(note, { body })
    if (err) {
      setActionError(err.message || t('chat.sendError'))
      return false
    }
    applyNote(data)
    reload()
    return true
  }

  const filtering = Boolean(exerciseFilter || textFilter)
  let lastDay = null

  return (
    <div className="flex flex-col h-full min-h-0 bg-fondo">
      {header}
      {isCoach && (
        <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white border-b border-linea min-w-0">
          {exerciseFilter || textFilter ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setExerciseFilter(null)
                  setTextFilter('')
                  setExChoice(undefined)
                }}
                className="inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 border border-primary-700 bg-primary-700 text-white text-xs font-medium min-w-0 max-w-full"
                aria-label={t('chat.filter.clear')}
              >
                {exerciseFilter ? (
                  <Dumbbell size={12} aria-hidden="true" className="flex-shrink-0" />
                ) : (
                  <Search size={12} aria-hidden="true" className="flex-shrink-0" />
                )}
                <span className="truncate">
                  {exerciseFilter
                    ? nameOf(exerciseFilter) || t('chat.filter.exercise')
                    : `“${textFilter}”`}
                </span>
                <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                  <X size={11} aria-hidden="true" />
                </span>
              </button>
              <span className="text-xs text-texto2 flex-shrink-0">
                {t('chat.filter.count', { count: visible.length })}
              </span>
            </>
          ) : (
            ['all', 'pending'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-medium ${
                  filter === f
                    ? 'bg-durazno-50 border-primary-600 text-primary-700'
                    : 'bg-white border-gray-300 text-texto2'
                }`}
              >
                {t(`chat.filter.${f}`)}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="rounded-full bg-primary-600 text-white text-[10.5px] px-1.5 leading-4">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setSheet('search')}
            className="w-9 h-9 rounded-full border border-gray-300 bg-white text-texto2 flex items-center justify-center flex-shrink-0"
            aria-label={t('chat.search.open')}
            title={t('chat.search.open')}
          >
            <Search size={16} />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-3"
      >
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-texto3" />
          </div>
        )}
        {!loading && error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
            <AlertCircle size={16} className="mt-0.5" />
            {t('chat.loadError')}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-texto2 px-6">
            <MessagesSquare size={28} className="text-texto3" />
            <p className="text-sm">
              {filter === 'all' && !filtering ? t('chat.empty') : t('chat.emptyFilter')}
            </p>
          </div>
        )}
        {!loading &&
          visible.map((it) => {
            const key = localDateKey(it.at)
            const showDay = key !== lastDay
            lastDay = key
            return (
              <Fragment key={`${it.type}-${it.id}`}>
                {showDay && (
                  <span className="self-center text-[11px] text-texto3 bg-white border border-linea rounded-full px-2.5 py-0.5 first-letter:uppercase">
                    {fmt.dayHeader(key)}
                  </span>
                )}
                {it.type === 'event' ? (
                  <ChatEventCard
                    event={it.event}
                    viewerRole={viewerRole}
                    name={studentName}
                    exerciseName={
                      it.event.exercise_id ? labels.exercises.get(it.event.exercise_id)?.name : null
                    }
                    wellbeingLogs={wellbeing}
                    timeLabel={fmt.time(it.at)}
                    pending={pendingEvIds.has(it.event.id)}
                    canAnswer={isCoach}
                    onReply={(ev) => chooseReply(eventTarget(ev, ev.payload?.skip_note || ''))}
                    onAnswerQuestion={
                      !isCoach && it.event.kind === 'week_complete'
                        ? (ev) => chooseReply(eventTarget(ev))
                        : undefined
                    }
                    onDismiss={async (ev, dismiss) => {
                      const { error: err } = await dismissEvent(ev.id, dismiss)
                      if (err) setActionError(t('chat.sheet.saveError'))
                      reload()
                    }}
                  />
                ) : (
                  <ChatMessage
                    item={it}
                    viewerRole={viewerRole}
                    labels={labelsX}
                    parent={it.note.parent_note_id ? notesById.get(it.note.parent_note_id) : null}
                    timeLabel={fmt.time(it.at)}
                    fmtDate={fmt.shortDate}
                    canManage={isCoach}
                    onAction={handleAction}
                    onUnlink={handleUnlink}
                    onEdit={handleEdit}
                    pending={isCoach && pendingIds.has(it.id)}
                    onFilterExercise={isCoach && !exerciseFilter ? filterByExercise : undefined}
                  />
                )}
              </Fragment>
            )
          })}
      </div>

      {actionError && (
        <p className="px-4 py-1.5 text-xs text-red-700 bg-red-50 border-t border-red-200">
          {actionError}
        </p>
      )}

      <ChatComposer
        onSend={handleSend}
        replyTo={replyTo}
        replyLabel={replyTo ? labelOf(replyTo) : ''}
        onClearReply={() => setReplyTo(null)}
        exerciseTarget={exerciseTargetView}
        onClearExercise={() => setExChoice(null)}
        onPickExercise={
          isCoach
            ? () => {
                setReplyTo(null)
                setSheet('picker')
              }
            : undefined
        }
        personName={isCoach ? (studentName || '').split(' ')[0] : ''}
        disabled={!threadId}
      />

      {sheet === 'picker' && (
        <ExercisePickerSheet
          groups={groups}
          nameOf={nameOf}
          counts={threadExercises}
          personName={(studentName || '').split(' ')[0]}
          onPick={(choice) => {
            setExChoice(choice)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'search' && (
        <ChatSearchSheet
          exercises={threadExercises}
          nameOf={nameOf}
          onPickExercise={(id) => {
            setTextFilter('')
            filterByExercise(id)
            setSheet(null)
          }}
          onSearchText={(q) => {
            setExerciseFilter(null)
            setTextFilter(q)
            setFilter('all')
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
