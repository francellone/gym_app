// ============================================================
// ExerciseHistoryPreview — Q1 visual del "Última vez" + chat
// ------------------------------------------------------------
// Componente reutilizable que renderiza el preview del ejercicio
// en dos modos:
//
//   - `mode='header'`: 1 línea ultra compacta para el header de
//     un card colapsado.
//     Layout: "⤴ Última vez (hoy/ayer/hace N días/DD/MM): 22.5kg · 8r · PSE 8"
//     + opcional badge 💬N que abre el drawer cuando se clickea.
//
//   - `mode='body'`: bloque más rico para el body expandido.
//     Muestra última nota del coach (si existe) + botón "Ver chat
//     completo" si hay >0 mensajes en el thread.
//
// Decisión Franco 23/05 late night:
//   - "Última vez" por exercise_id global.
//   - Última nota = coach only.
//   - Drawer = read-only V1.
// ============================================================

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, MessageCircle, ChevronRight, User, Send, Loader2 } from 'lucide-react'
import { useExerciseChat, lastConversation } from '../exerciseChatContext'
import {
  formatLastLogSummary,
  formatLastBlockLogSummary,
  formatRelativeDate,
} from '../exerciseHistoryLogic'

// ============================================================
// HeaderLine — 1 línea para el header del card
// ============================================================
// Props:
//   lastLog       workout_log | null (preferencia para strength)
//   lastBlockLog  workout_block_log | null (para aerobic/circuit)
//   noteCount     number — total de notas shared (coach+student) del ejercicio
//   onOpenChat    () => void — abre el drawer
//   isCompact     bool — usa font-size todavía menor (para circuit-children)
//
// Si lastLog/lastBlockLog viene null Y noteCount=0, no renderiza nada
// (el componente padre puede llamar siempre sin gates).
// ============================================================
export function ExerciseHistoryHeaderLine({
  lastLog = null,
  lastBlockLog = null,
  noteCount = 0,
  onOpenChat,
  isCompact = false,
}) {
  const { t } = useTranslation()
  const log = lastLog || lastBlockLog
  const hasLog = !!log
  // v54: el chat siempre tiene puerta (antes solo con mensajes; en un
  // ejercicio nuevo no había forma visible de comentar).
  const hasChat = typeof onOpenChat === 'function'
  if (!hasLog && !hasChat) return null

  const summary = lastLog
    ? formatLastLogSummary(lastLog, t)
    : lastBlockLog
      ? formatLastBlockLogSummary(lastBlockLog, t)
      : ''

  const relDate = hasLog ? formatRelativeDate(log.logged_date, undefined, t) : ''

  const textSize = isCompact ? 'text-[10px]' : 'text-[11px]'

  return (
    <div className={`flex items-center gap-1.5 mt-0.5 ${textSize} text-gray-500`}>
      {hasLog && summary && (
        <span
          className="flex items-center gap-1 truncate"
          title={t('workout.lastTimeTitle', { date: relDate })}
        >
          <History size={isCompact ? 9 : 11} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">
            {relDate && <span className="text-gray-400">{relDate}: </span>}
            <span className="text-gray-700 font-medium">{summary}</span>
          </span>
        </span>
      )}
      {hasChat && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat?.()
          }}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-semibold transition-colors flex-shrink-0 text-[10px] ${
            noteCount > 0
              ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
          }`}
          aria-label={t('workout.seeExerciseChatAria', { count: noteCount })}
        >
          <MessageCircle size={isCompact ? 9 : 10} />
          {noteCount}
        </button>
      )}
    </div>
  )
}

// ============================================================
// BodyBlock — bloque para el body expandido del card
// ============================================================
// Props:
//   previewNote    note | null — nota a mostrar (coach si existe; si no, alumno)
//   noteCount      number — para mostrar el contador
//   onOpenChat     () => void — abre el drawer
// ============================================================
export function ExerciseHistoryBodyBlock({
  previewNote = null,
  noteCount = 0,
  onOpenChat,
  exerciseId = null,
}) {
  const chat = useExerciseChat()
  if (chat && exerciseId) {
    return <ExerciseConversationBox exerciseId={exerciseId} chat={chat} onOpenChat={onOpenChat} />
  }
  return <LegacyBodyBlock previewNote={previewNote} noteCount={noteCount} onOpenChat={onOpenChat} />
}

// ============================================================
// ExerciseConversationBox — "Con tu coach" (2026-10-22)
// ------------------------------------------------------------
// Los últimos mensajes sobre el ejercicio y un campo para contestar ahí
// mismo, sin tener que registrar antes ni ir al Chat. Lo mismo en modo
// coach (escribe ella, con su nombre). Sin mensajes no se muestra: el
// globito 💬 del encabezado abre el panel para empezar.
// ============================================================
function ExerciseConversationBox({ exerciseId, chat, onOpenChat }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(false)
  const all = chat.notesByExercise?.get(exerciseId) || []
  const viewer = chat.viewerRole
  const shown = lastConversation(all, 2, viewer)
  if (!shown.length) return null
  const hasOther = all.some((n) => n.author_role !== viewer && !n.source_note_id)

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(false)
    const ok = await chat.send(exerciseId, body)
    setSending(false)
    if (ok) setText('')
    else setError(true)
  }

  const who = (n) =>
    n.author_role === viewer
      ? t('notes.preview.you')
      : n.author_role === 'coach'
        ? t('workout.exChat.yourCoach')
        : t('notes.preview.person')
  const inputId = `exchat-${exerciseId}`

  return (
    <div className="bg-durazno-50 border border-durazno-200 rounded-xl p-3 flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-primary-800 flex items-center gap-1.5">
        <MessageCircle size={13} aria-hidden="true" />
        {viewer === 'coach' ? t('workout.exChat.titleCoach') : t('workout.exChat.title')}
      </p>
      {shown.map((n) => {
        const mine = n.author_role === viewer
        return (
          <div
            key={n.id}
            className={`max-w-[88%] rounded-2xl px-3 py-1.5 text-sm leading-snug border ${
              mine
                ? 'self-end bg-white border-linea text-texto2 rounded-tr-md'
                : 'self-start bg-white border-primary-200 text-tinta rounded-tl-md'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{n.body}</p>
            <p className="text-[10.5px] text-texto3 text-right mt-0.5">
              {who(n)}
              {n.created_at
                ? ` · ${formatRelativeDate(n.created_at.slice(0, 10), undefined, t)}`
                : ''}
            </p>
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('workout.exChat.replyLabel')}
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={
            viewer === 'coach'
              ? t('workout.exChat.placeholderCoach')
              : hasOther
                ? t('workout.exChat.placeholderReply')
                : t('workout.exChat.placeholderWrite')
          }
          className="input flex-1 min-w-0 text-sm h-10 py-0 rounded-full bg-white"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-full bg-primary-700 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{t('chat.sendError')}</p>}
      {all.length > shown.length && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat?.()
          }}
          className="self-start text-xs font-semibold text-primary-700 flex items-center gap-1 py-1"
        >
          {t('workout.exChat.seeAll', { count: all.length })}
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function LegacyBodyBlock({ previewNote = null, noteCount = 0, onOpenChat }) {
  const { t } = useTranslation()
  const hasNote = !!previewNote
  const hasChat = noteCount > 0
  if (!hasNote && !hasChat) return null

  // Regla (Franco 2026-07-24): mostramos la nota del coach si existe
  // (gana siempre); si no, el último comentario del alumno. El
  // título / ícono / color cambian según quién la escribió.
  const isCoach = previewNote?.author_role === 'coach'
  const theme = isCoach
    ? {
        box: 'bg-primary-50 border-primary-200',
        title: 'text-primary-700',
        date: 'text-primary-500/80',
        link: 'text-primary-700 hover:text-primary-800',
        linkMuted: 'text-primary-500/80',
      }
    : {
        box: 'bg-green-50 border-green-200',
        title: 'text-green-700',
        date: 'text-green-600/80',
        link: 'text-green-700 hover:text-green-800',
        linkMuted: 'text-green-600/80',
      }
  const TitleIcon = isCoach ? MessageCircle : User
  const titleText = isCoach ? t('workout.lastCoachNote') : t('workout.yourLastComment')

  return (
    <div className={`${theme.box} border rounded-xl p-3 space-y-2`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${theme.title}`}>
        <TitleIcon size={13} />
        <span>{titleText}</span>
        {hasNote && previewNote.created_at && (
          <span className={`${theme.date} font-normal`}>
            · {formatRelativeDate(previewNote.created_at.slice(0, 10), undefined, t)}
          </span>
        )}
      </div>
      {hasNote ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words line-clamp-3">
          {previewNote.body}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">
          {t('workout.noCoachNotes', { count: noteCount })}
        </p>
      )}
      {hasChat && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat?.()
          }}
          className={`text-xs ${theme.link} font-semibold flex items-center gap-1`}
        >
          {t('workout.seeFullChat')}
          <ChevronRight size={13} />
          <span className={`${theme.linkMuted} font-normal`}>
            {t('workout.messagesCount', { count: noteCount })}
          </span>
        </button>
      )}
    </div>
  )
}
