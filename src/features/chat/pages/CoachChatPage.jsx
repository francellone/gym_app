// Sección Chat de la coach (barra lateral): lista de personas a la izquierda
// y la conversación elegida a la derecha. En el celular, una cosa por vez.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Search, Loader2, User, ClipboardList, MessagesSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import AvatarImage from '@/features/avatars/AvatarImage'
import { getOrCreateThreadForStudent } from '@/features/notes/api'
import { listCoachConversations, fetchPreviews, subscribeCoachThreads } from '../chatApi'
import { lastItemByThread } from '../chatModel'
import { eventTitle } from '../chatText'
import ChatConversation from '../components/ChatConversation'

function Avatar({ person, size = 'w-10 h-10' }) {
  return (
    <div
      className={`${size} rounded-full bg-durazno-100 flex items-center justify-center overflow-hidden flex-shrink-0`}
    >
      <AvatarImage path={person?.avatar_url} alt={person?.name}>
        <span className="text-primary-700 font-semibold text-sm">
          {person?.name?.[0]?.toUpperCase() || '?'}
        </span>
      </AvatarImage>
    </div>
  )
}

function relTime(iso, t, locale) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(now.getTime() - 86400000)
  if (d.toDateString() === yest.toDateString()) return t('chat.yesterday')
  const days = (now - d) / 86400000
  if (days < 6) return d.toLocaleDateString(locale, { weekday: 'short' })
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' })
}

export default function CoachChatPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'es-AR'
  const { studentId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const coachId = profile?.id
  const [rows, setRows] = useState([])
  const [previews, setPreviews] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [thread, setThread] = useState({ studentId: null, id: null, error: null })
  const reloadTimer = useRef(null)

  const loadList = useCallback(async () => {
    if (!coachId) return
    const { data } = await listCoachConversations(coachId)
    const list = data || []
    setRows(list)
    setLoading(false)
    const ids = list.map((r) => r.thread?.id).filter(Boolean)
    const { data: prev } = await fetchPreviews(ids)
    if (prev) setPreviews(lastItemByThread(prev))
  }, [coachId])

  useEffect(() => {
    loadList()
    const off = subscribeCoachThreads(coachId, () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(loadList, 500)
    })
    return () => {
      off()
      clearTimeout(reloadTimer.current)
    }
  }, [coachId, loadList])

  // Resolver (o crear) el hilo de la persona elegida
  useEffect(() => {
    if (!studentId || !coachId) return
    let alive = true
    const known = rows.find((r) => r.person.id === studentId)?.thread?.id
    if (known) {
      setThread({ studentId, id: known, error: null })
      return
    }
    getOrCreateThreadForStudent(studentId, coachId).then(({ data, error }) => {
      if (!alive) return
      setThread({ studentId, id: data || null, error: error || null })
    })
    return () => {
      alive = false
    }
  }, [studentId, coachId, rows])

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => {
        const unread = r.thread?.unread_for_coach || 0
        if (onlyUnread && !unread) return false
        if (q) return (r.person.name || '').toLowerCase().includes(q)
        return r.person.active !== false || unread > 0 || r.person.id === studentId
      })
      .sort((a, b) => {
        const ta = Date.parse(a.thread?.last_message_at || '') || 0
        const tb = Date.parse(b.thread?.last_message_at || '') || 0
        if (ta !== tb) return tb - ta
        return (a.person.name || '').localeCompare(b.person.name || '')
      })
  }, [rows, query, onlyUnread, studentId])

  const selected = rows.find((r) => r.person.id === studentId)?.person
  const firstName = selected?.name?.split(' ')[0] || selected?.name

  function previewText(r) {
    const item = r.thread ? previews.get(r.thread.id) : null
    if (!item) return t('coach.chat.noMessages')
    if (item.type === 'event') {
      return eventTitle(t, item.event, {
        viewerRole: 'coach',
        name: r.person.name?.split(' ')[0],
        lng: i18n.language,
      })
    }
    const prefix = item.note.author_role === 'coach' ? `${t('coach.chat.you')}: ` : ''
    return prefix + item.note.body
  }

  const header = selected && (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 bg-white border-b border-linea">
      <button
        type="button"
        onClick={() => navigate('/coach/chat')}
        className="lg:hidden p-1.5 -ml-1 rounded-lg text-texto2"
        aria-label={t('coach.chat.back')}
      >
        <ArrowLeft size={18} />
      </button>
      <Avatar person={selected} size="w-9 h-9" />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-tinta break-words">{selected.name}</p>
      </div>
      <Link
        to={`/coach/students/${selected.id}`}
        className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
      >
        <User size={13} />
        <span className="hidden sm:inline">{t('coach.chat.viewProfile')}</span>
      </Link>
      <Link
        to={`/coach/students/${selected.id}?tab=plans`}
        className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
      >
        <ClipboardList size={13} />
        <span className="hidden sm:inline">{t('coach.chat.viewPlan')}</span>
      </Link>
    </div>
  )

  return (
    // contain:inline-size evita que el ancho de los filtros (con scroll propio)
    // agrande la página en el celular.
    <div className="-mx-4 -my-6 lg:m-0 h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-3rem)] flex bg-white lg:border lg:border-linea lg:rounded-2xl overflow-hidden [contain:inline-size]">
      {/* Lista */}
      <aside
        className={`${studentId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 flex-col border-r border-linea min-w-0`}
      >
        <div className="px-4 pt-4 pb-3 flex flex-col gap-2.5 border-b border-linea">
          <h1 className="text-lg font-bold text-tinta">{t('coach.chat.title')}</h1>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-texto3"
              aria-hidden="true"
            />
            <label htmlFor="chat-search" className="sr-only">
              {t('coach.chat.search')}
            </label>
            <input
              id="chat-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('coach.chat.search')}
              className="input pl-8 text-sm"
            />
          </div>
          <div className="flex gap-1.5">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setOnlyUnread(v)}
                aria-pressed={onlyUnread === v}
                className={`rounded-full px-3 py-1 border text-xs font-medium ${
                  onlyUnread === v
                    ? 'bg-durazno-50 border-primary-600 text-primary-700'
                    : 'bg-white border-gray-300 text-texto2'
                }`}
              >
                {v ? t('coach.chat.unread') : t('coach.chat.all')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin text-texto3" />
            </div>
          )}
          {!loading && !sorted.length && (
            <p className="text-sm text-texto2 px-4 py-8 text-center">{t('coach.chat.noPeople')}</p>
          )}
          {sorted.map((r) => {
            const unread = r.thread?.unread_for_coach || 0
            const on = r.person.id === studentId
            return (
              <button
                key={r.person.id}
                type="button"
                onClick={() => navigate(`/coach/chat/${r.person.id}`)}
                className={`w-full text-left flex gap-3 px-4 py-3 border-b border-linea ${on ? 'bg-durazno-50' : 'hover:bg-durazno-50/50'}`}
              >
                <Avatar person={r.person} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`text-sm text-tinta truncate ${unread ? 'font-bold' : 'font-medium'}`}
                    >
                      {r.person.name}
                    </p>
                    <span className="text-[11px] text-texto3 flex-shrink-0">
                      {relTime(r.thread?.last_message_at, t, locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-xs truncate ${unread ? 'text-tinta' : 'text-texto2'}`}>
                      {previewText(r)}
                    </p>
                    {unread > 0 && (
                      <span className="min-w-[19px] h-[19px] px-1.5 rounded-full bg-primary-700 text-white text-[11px] font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Conversación */}
      <section className={`${studentId ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0`}>
        {!studentId && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-texto2 bg-fondo">
            <MessagesSquare size={30} className="text-texto3" />
            <p className="text-sm">{t('coach.chat.pickSomeone')}</p>
          </div>
        )}
        {studentId && thread.studentId === studentId && thread.error && (
          <p className="m-4 text-sm text-red-700 bg-red-50 rounded-xl p-3">
            {t('coach.chat.openError')}
          </p>
        )}
        {studentId && thread.studentId === studentId && thread.id && (
          <ChatConversation
            key={thread.id}
            threadId={thread.id}
            studentId={studentId}
            studentName={firstName}
            viewerRole="coach"
            authorId={coachId}
            header={header}
          />
        )}
        {studentId && thread.studentId !== studentId && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-texto3" />
          </div>
        )}
      </section>
    </div>
  )
}
