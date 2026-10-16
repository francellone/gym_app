// Conversación coach↔persona: mensajes, eventos y caja para escribir.
// La usan la sección Chat de la coach y el Chat de la persona.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, Lock, MessagesSquare } from 'lucide-react'
import { createNote, replyNote, editNote } from '@/features/notes/api'
import { useChatThread } from '../useChatThread'
import {
  buildTimeline,
  filterTimeline,
  countPrivate,
  localDateKey,
  prepareCatalog,
} from '../chatModel'
import { fetchCatalog, fetchActivePlans, linkNote, unlinkNote } from '../chatApi'
import ChatEventCard from './ChatEventCard'
import ChatMessage from './ChatMessage'
import ChatComposer from './ChatComposer'
import LinkSheet from './LinkSheet'

const FILTERS = ['all', 'messages', 'events', 'plan', 'private']

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
  const { t } = useTranslation()
  const isCoach = viewerRole === 'coach'
  const { notes, events, wellbeing, labels, loading, error, reload, applyNote } = useChatThread({
    threadId,
    studentId,
    viewerRole,
  })
  const [filter, setFilter] = useState('all')
  const [replyTo, setReplyTo] = useState(null)
  const [sheet, setSheet] = useState(null) // { note, mode, preset }
  const [catalog, setCatalog] = useState(null)
  const [catalogNames, setCatalogNames] = useState(null)
  const [activePlans, setActivePlans] = useState([])
  const [actionError, setActionError] = useState(null)
  const scrollRef = useRef(null)
  const stick = useRef(true)
  const fmt = useDateFormat()

  useEffect(() => {
    if (!isCoach) return
    let alive = true
    fetchCatalog().then(({ data }) => {
      if (!alive || !data) return
      setCatalog(prepareCatalog(data))
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

  const timeline = useMemo(() => buildTimeline({ notes, events }), [notes, events])
  const visible = useMemo(
    () => (isCoach ? filterTimeline(timeline, filter, { notes }) : timeline),
    [timeline, filter, notes, isCoach]
  )
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const privateCount = useMemo(() => countPrivate(notes), [notes])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [visible.length, loading, wellbeing])

  useEffect(() => {
    stick.current = true
  }, [threadId, filter])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function handleSend(body, { alsoPlan, exercise }) {
    setActionError(null)
    stick.current = true
    const privateMode = isCoach && filter === 'private'
    const res = replyTo
      ? await replyNote(replyTo.id, { body, authorId, authorRole: viewerRole })
      : await createNote({
          threadId,
          body,
          authorId,
          authorRole: viewerRole,
          visibility: privateMode ? 'coach_private' : 'shared',
        })
    if (res.error) {
      setActionError(res.error.message || t('chat.sendError'))
      return false
    }
    applyNote(res.data)
    setReplyTo(null)
    if (alsoPlan && res.data) setSheet({ note: res.data, mode: 'plan', preset: exercise })
    return true
  }

  async function handleAction(kind, note) {
    setActionError(null)
    if (kind === 'reply') {
      setReplyTo(note)
      return
    }
    if (kind === 'private') {
      const { error: err } = await linkNote({ sourceNoteId: note.id, target: 'private' })
      if (err) setActionError(t('chat.sheet.saveError'))
      reload()
      return
    }
    if (kind === 'plan' || kind === 'day') setSheet({ note, mode: kind, preset: null })
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

  let lastDay = null

  return (
    <div className="flex flex-col h-full min-h-0 bg-fondo">
      {header}
      {isCoach && (
        <div className="flex gap-1.5 overflow-x-auto px-3 sm:px-4 py-2 bg-white border-b border-linea">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 border text-xs font-medium ${
                filter === f
                  ? 'bg-durazno-50 border-primary-600 text-primary-700'
                  : 'bg-white border-gray-300 text-texto2'
              }`}
            >
              {f === 'private' && <Lock size={11} aria-hidden="true" />}
              {t(`chat.filter.${f}`)}
              {f === 'private' && privateCount > 0 && ` · ${privateCount}`}
            </button>
          ))}
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
            <p className="text-sm">{filter === 'all' ? t('chat.empty') : t('chat.emptyFilter')}</p>
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
                  />
                ) : (
                  <ChatMessage
                    item={it}
                    viewerRole={viewerRole}
                    labels={labels}
                    parent={it.note.parent_note_id ? notesById.get(it.note.parent_note_id) : null}
                    timeLabel={fmt.time(it.at)}
                    fmtDate={fmt.shortDate}
                    canManage={isCoach}
                    onAction={handleAction}
                    onUnlink={handleUnlink}
                    onEdit={handleEdit}
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
        catalog={isCoach ? catalog : null}
        privateMode={isCoach && filter === 'private'}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabled={!threadId}
      />

      {sheet && (
        <LinkSheet
          note={sheet.note}
          mode={sheet.mode}
          presetExercise={sheet.preset}
          catalog={catalog}
          catalogNames={catalogNames}
          activePlans={activePlans}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null)
            reload()
          }}
        />
      )}
    </div>
  )
}
