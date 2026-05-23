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

import { History, MessageCircle, ChevronRight } from 'lucide-react'
import { formatLastLogSummary, formatLastBlockLogSummary, formatRelativeDate } from '../exerciseHistoryLogic'

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
  const log = lastLog || lastBlockLog
  const hasLog = !!log
  const hasChat = noteCount > 0
  if (!hasLog && !hasChat) return null

  const summary = lastLog
    ? formatLastLogSummary(lastLog)
    : lastBlockLog
      ? formatLastBlockLogSummary(lastBlockLog)
      : ''

  const relDate = hasLog ? formatRelativeDate(log.logged_date) : ''

  const textSize = isCompact ? 'text-[10px]' : 'text-[11px]'

  return (
    <div className={`flex items-center gap-1.5 mt-0.5 ${textSize} text-gray-500`}>
      {hasLog && summary && (
        <span className="flex items-center gap-1 truncate" title={`Última vez ${relDate}`}>
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
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 hover:bg-primary-200 font-semibold transition-colors flex-shrink-0 ${
            isCompact ? 'text-[10px]' : 'text-[10px]'
          }`}
          aria-label={`Ver chat del ejercicio (${noteCount} mensajes)`}
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
//   lastCoachNote  note | null — última nota del coach (context_type='exercise')
//   noteCount      number — para mostrar el contador
//   onOpenChat     () => void — abre el drawer
// ============================================================
export function ExerciseHistoryBodyBlock({
  lastCoachNote = null,
  noteCount = 0,
  onOpenChat,
}) {
  const hasNote = !!lastCoachNote
  const hasChat = noteCount > 0
  if (!hasNote && !hasChat) return null

  return (
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-700">
        <MessageCircle size={13} />
        <span>Última nota del coach</span>
        {hasNote && lastCoachNote.created_at && (
          <span className="text-primary-500/80 font-normal">
            · {formatRelativeDate(lastCoachNote.created_at.slice(0, 10))}
          </span>
        )}
      </div>
      {hasNote ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words line-clamp-3">
          {lastCoachNote.body}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">
          Sin notas del coach. El chat tiene {noteCount} mensaje{noteCount === 1 ? '' : 's'}.
        </p>
      )}
      {hasChat && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat?.()
          }}
          className="text-xs text-primary-700 hover:text-primary-800 font-semibold flex items-center gap-1"
        >
          Ver chat completo
          <ChevronRight size={13} />
          <span className="text-primary-500/80 font-normal">
            ({noteCount} mensaje{noteCount === 1 ? '' : 's'})
          </span>
        </button>
      )}
    </div>
  )
}
