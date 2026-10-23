// Caja para escribir (simplificada 2026-10-22, pedido de Franco).
// - Sin "Va a:". Un mensaje va suelto, salvo que:
//   · se tocó "Responder" en un mensaje o evento → "Respondiendo a … ✕";
//   · la coach eligió un ejercicio con la pesa (o está filtrando por uno) →
//     "Sobre: Sentadilla · Día A ✕": el mensaje queda en ese ejercicio del
//     plan y la persona lo ve (y lo contesta) en Entrenar.
// - Responder y "sobre un ejercicio" se excluyen: elegir uno saca el otro.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Dumbbell, X, CornerDownRight } from 'lucide-react'

export default function ChatComposer({
  onSend,
  replyTo, // nota o evento al que se responde, o null
  replyLabel = '', // etiqueta de lo que se responde
  onClearReply,
  exerciseTarget, // { name, dayLabel } | null
  onClearExercise,
  onPickExercise, // abre la lista de ejercicios (solo coach)
  personName = '',
  onTypingChange,
  disabled = false,
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const ref = useRef(null)
  const hasText = text.trim().length > 0

  useEffect(() => {
    onTypingChange?.(hasText)
  }, [hasText, onTypingChange])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  useEffect(() => {
    if (replyTo || exerciseTarget) ref.current?.focus()
  }, [replyTo, exerciseTarget])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const ok = await onSend(body)
    setSending(false)
    if (ok !== false) setText('')
  }

  function onKeyDown(e) {
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !coarse) {
      e.preventDefault()
      send()
    }
  }

  const placeholder = exerciseTarget
    ? t('chat.composer.aboutPlaceholder')
    : personName
      ? t('chat.composer.placeholderTo', { name: personName })
      : t('chat.placeholder')

  return (
    <div className="border-t border-linea bg-white px-3 sm:px-4 pt-2 pb-3 flex flex-col gap-2">
      {replyTo && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 pl-2.5 pr-1 py-1.5 min-w-0">
          <CornerDownRight size={14} className="text-texto2 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0 text-xs leading-snug">
            <p className="font-medium text-tinta truncate">
              {t('chat.composer.replyingTo', { what: replyLabel || t('chat.target.comment') })}
            </p>
            {replyTo.body && (
              <p className="text-texto2 line-clamp-1 break-words">“{replyTo.body}”</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="w-8 h-8 flex items-center justify-center rounded-full text-texto2 hover:text-tinta flex-shrink-0"
            aria-label={t('chat.composer.cancelReply')}
            title={t('chat.composer.cancelReply')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {exerciseTarget && !replyTo && (
        <div className="flex items-center gap-2 rounded-xl border border-durazno-200 bg-durazno-50 pl-2.5 pr-1 py-1.5 min-w-0">
          <Dumbbell size={14} className="text-primary-700 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0 text-xs leading-snug">
            <p className="font-bold text-tinta break-words">
              {t('chat.composer.about', {
                what: [exerciseTarget.name, exerciseTarget.dayLabel].filter(Boolean).join(' · '),
              })}
            </p>
            <p className="text-texto2">{t('chat.composer.aboutHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClearExercise}
            className="w-8 h-8 flex items-center justify-center rounded-full text-texto2 hover:text-tinta flex-shrink-0"
            aria-label={t('chat.composer.withoutExercise')}
            title={t('chat.composer.withoutExercise')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {onPickExercise && (
          <button
            type="button"
            onClick={onPickExercise}
            disabled={disabled}
            className="w-10 h-10 rounded-full border border-durazno-200 bg-durazno-50 text-primary-700 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            aria-label={t('chat.composer.aboutExercise')}
            title={t('chat.composer.aboutExercise')}
          >
            <Dumbbell size={17} />
          </button>
        )}
        <label htmlFor="chat-composer" className="sr-only">
          {t('chat.placeholder')}
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="input flex-1 min-w-0 resize-none min-h-[42px] text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={!hasText || sending || disabled}
          className="w-10 h-10 rounded-full bg-primary-700 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  )
}
