// Conversación coach↔persona: mensajes, eventos y caja para escribir.
// La usan la sección Chat de la coach y el Chat de la persona.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, Lock, MessagesSquare } from 'lucide-react'
import { createNote, replyNote, editNote, softDeleteNote } from '@/features/notes/api'
import { useChatThread } from '../useChatThread'
import {
  buildTimeline,
  filterTimeline,
  countPrivate,
  localDateKey,
  prepareCatalog,
  pendingFor,
  preselectTarget,
  pendingEvents,
  eventTarget,
  SKIP_KINDS,
} from '../chatModel'
import { contextLabel, eventTitle } from '../chatText'
import {
  fetchCatalog,
  fetchActivePlans,
  linkNote,
  unlinkNote,
  dismissReply,
  dismissEvent,
} from '../chatApi'
import ChatEventCard from './ChatEventCard'
import ChatMessage from './ChatMessage'
import ChatComposer from './ChatComposer'
import LinkSheet from './LinkSheet'

const FILTERS_COACH = ['all', 'pending', 'messages', 'events', 'plan', 'private']
// La persona no tiene notas privadas en el chat
const FILTERS_STUDENT = ['all', 'messages', 'events', 'plan']

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
  const [filter, setFilter] = useState('all')
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
  const visible = useMemo(() => {
    if (filter === 'pending') {
      const ids = new Set(pendingFor(notes, viewerRole).map((n) => n.id))
      const evIds = new Set(isCoach ? pendingEvents(events, notes).map((e) => e.id) : [])
      return timeline.filter(
        (it) => (it.type === 'note' && ids.has(it.id)) || (it.type === 'event' && evIds.has(it.id))
      )
    }
    return filterTimeline(timeline, filter, { notes })
  }, [timeline, filter, notes, events, viewerRole, isCoach])
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const privateCount = useMemo(() => countPrivate(notes), [notes])

  // ── A qué va el próximo mensaje ──────────────────────────
  // choice: undefined = lo que se sugiera solo; null = General; nota = elegida.
  // frozen: destino congelado mientras hay texto escrito.
  const privateMode = isCoach && filter === 'private'
  const [choice, setChoice] = useState(undefined)
  const [frozen, setFrozen] = useState(undefined)
  const [picking, setPicking] = useState(false)
  const pendingAll = useMemo(
    () => (privateMode ? [] : pendingFor(notes, viewerRole)),
    [notes, viewerRole, privateMode]
  )
  const pendingIds = useMemo(() => new Set(pendingAll.map((n) => n.id)), [pendingAll])
  // Omisiones que piden respuesta (solo la coach las responde)
  const pendingEv = useMemo(
    () => (isCoach && !privateMode ? pendingEvents(events, notes) : []),
    [isCoach, privateMode, events, notes]
  )
  const pendingEvIds = useMemo(() => new Set(pendingEv.map((e) => e.id)), [pendingEv])
  const pendingTargets = useMemo(() => {
    const evTargets = pendingEv.map((e) => eventTarget(e, e.payload?.skip_note || ''))
    return [...pendingAll, ...evTargets].sort(
      (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
    )
  }, [pendingAll, pendingEv])
  const autoTarget = useMemo(() => {
    if (privateMode) return null
    // Si lo último que pasó es una omisión que pide respuesta (< 48 h), va esa.
    const lastEv = events[events.length - 1]
    const lastNote = [...notes]
      .filter((n) => !n.deleted_at && !n.source_note_id && n.visibility !== 'coach_private')
      .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0))
      .pop()
    const evAt = lastEv ? Date.parse(lastEv.occurred_at) || 0 : 0
    const noteAt = lastNote ? Date.parse(lastNote.created_at) || 0 : 0
    if (isCoach && lastEv && evAt > noteAt) {
      const fresh = Date.now() - evAt < 48 * 3600000
      return fresh && pendingEvIds.has(lastEv.id)
        ? eventTarget(lastEv, lastEv.payload?.skip_note || '')
        : null
    }
    return preselectTarget(notes, viewerRole)
  }, [notes, events, viewerRole, privateMode, isCoach, pendingEvIds])
  const liveTarget = choice === undefined ? autoTarget : choice
  const liveIsAuto = choice === undefined && Boolean(autoTarget)
  const target = privateMode ? null : frozen !== undefined ? frozen.note : liveTarget
  const targetIsAuto = frozen !== undefined ? frozen.auto : liveIsAuto
  const suggestion = !isCoach && !target ? pendingAll[0] || null : null
  const liveRef = useRef({ note: liveTarget, auto: liveIsAuto })
  liveRef.current = { note: liveTarget, auto: liveIsAuto }

  const onTypingChange = useCallback((has) => {
    setFrozen((prev) => {
      if (has) return prev !== undefined ? prev : { ...liveRef.current }
      return undefined
    })
  }, [])

  function chooseTarget(note) {
    setChoice(note)
    setPicking(false)
    setFrozen((prev) => (prev !== undefined ? { note, auto: false } : prev))
  }

  const labelOf = useCallback(
    (n) =>
      n?.isEvent
        ? eventTitle(t, n.event, { viewerRole, name: studentName, lng: i18n.language })
        : contextLabel(t, n, labels, fmt.shortDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, labels, viewerRole, studentName]
  )

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
    // Eligió "Otro mensaje…" pero todavía no tocó ninguno: no mandar suelto.
    if (picking) {
      setActionError(t('chat.target.pickFirst'))
      return false
    }
    stick.current = true
    const res = target?.isEvent
      ? await createNote({
          threadId,
          body,
          authorId,
          authorRole: viewerRole,
          contextType: target.context_type,
          contextId: target.context_id,
        })
      : target
        ? await replyNote(target.id, { body, authorId, authorRole: viewerRole })
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
    setChoice(undefined)
    setFrozen(undefined)
    if (alsoPlan && res.data) setSheet({ note: res.data, mode: 'plan', preset: exercise })
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
      if (target?.id === note.id) setChoice(undefined)
      applyNote({ ...note, deleted_at: new Date().toISOString() })
      reload()
      return
    }
    if (kind === 'reply') {
      chooseTarget(note)
      return
    }
    if (kind === 'dismiss' || kind === 'undismiss') {
      const { error: err } = await dismissReply(note.id, kind === 'dismiss')
      if (err) setActionError(t('chat.sheet.saveError'))
      reload()
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
      <div className="flex gap-1.5 overflow-x-auto px-3 sm:px-4 py-2 bg-white border-b border-linea">
        {(isCoach ? FILTERS_COACH : FILTERS_STUDENT).map((f) => (
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
            {t(!isCoach && f === 'plan' ? 'chat.filter.planYou' : `chat.filter.${f}`)}
            {f === 'private' && privateCount > 0 && ` · ${privateCount}`}
            {f === 'pending' && pendingTargets.length > 0 && ` · ${pendingTargets.length}`}
          </button>
        ))}
      </div>

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
                    pending={pendingEvIds.has(it.event.id)}
                    canAnswer={isCoach && SKIP_KINDS.has(it.event.kind)}
                    onReply={(ev) => chooseTarget(eventTarget(ev, ev.payload?.skip_note || ''))}
                    onDismiss={async (ev, dismiss) => {
                      const { error: err } = await dismissEvent(ev.id, dismiss)
                      if (err) setActionError(t('chat.sheet.saveError'))
                      reload()
                    }}
                    picking={picking}
                    onPick={
                      SKIP_KINDS.has(it.event.kind) && isCoach
                        ? (ev) => chooseTarget(eventTarget(ev, ev.payload?.skip_note || ''))
                        : undefined
                    }
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
                    pending={isCoach && pendingIds.has(it.id)}
                    picking={picking}
                    onPick={chooseTarget}
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
        privateMode={privateMode}
        target={target}
        targetIsAuto={targetIsAuto}
        suggestion={suggestion}
        pending={pendingTargets.slice(0, 6)}
        labelOf={labelOf}
        onChooseTarget={chooseTarget}
        onPickOther={() => setPicking(true)}
        picking={picking}
        onCancelPicking={() => setPicking(false)}
        onTypingChange={onTypingChange}
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
