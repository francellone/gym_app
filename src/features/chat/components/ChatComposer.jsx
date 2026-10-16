// Caja para escribir. Para la coach, si el texto nombra un ejercicio del
// catálogo, ofrece guardarlo también en el plan apenas se envía.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Dumbbell, Lock, X, CornerDownRight } from 'lucide-react'
import { detectExercise } from '../chatModel'

export default function ChatComposer({
  onSend,
  catalog,
  privateMode = false,
  replyTo,
  replyMode = null, // 'manual' | 'auto' | 'general' | null
  replyLabel,
  onChooseGeneral,
  onChooseReply,
  onCancelReply,
  disabled = false,
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [alsoPlan, setAlsoPlan] = useState(false)
  const [dismissed, setDismissed] = useState(null)
  const [debounced, setDebounced] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(id)
  }, [text])

  const detection = useMemo(
    () => (catalog && !privateMode ? detectExercise(debounced, catalog) : { match: null }),
    [debounced, catalog, privateMode]
  )
  const match = detection.match && detection.match.id !== dismissed ? detection.match : null
  const planOn = Boolean(match) && alsoPlan

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  useEffect(() => {
    if (replyMode === 'manual') ref.current?.focus()
  }, [replyMode, replyTo])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const ok = await onSend(body, { alsoPlan: planOn, exercise: match })
    setSending(false)
    if (ok !== false) {
      setText('')
      setAlsoPlan(false)
      setDismissed(null)
    }
  }

  function onKeyDown(e) {
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !coarse) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="border-t border-linea bg-white px-3 sm:px-4 pt-2 pb-3 flex flex-col gap-2">
      {replyMode === 'manual' && replyTo && (
        <div className="flex items-start gap-2 text-xs text-texto2 bg-gray-50 rounded-lg px-2.5 py-1.5">
          <CornerDownRight size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 line-clamp-2 break-words">
            <span className="font-medium text-tinta">{t('chat.replyingTo')}</span>{' '}
            {replyLabel ? `${replyLabel}: ` : ''}
            {replyTo.body}
          </p>
          <button type="button" onClick={onCancelReply} aria-label={t('chat.cancel')}>
            <X size={14} />
          </button>
        </div>
      )}
      {(replyMode === 'auto' || replyMode === 'general') && replyTo && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-texto2">
            <span>{t('chat.target.goesTo')}</span>
            <button
              type="button"
              onClick={onChooseReply}
              aria-pressed={replyMode === 'auto'}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-medium max-w-full ${
                replyMode === 'auto'
                  ? 'bg-durazno-50 border-primary-600 text-primary-700'
                  : 'bg-white border-gray-300 text-texto2'
              }`}
            >
              <CornerDownRight size={12} aria-hidden="true" />
              <span className="truncate">
                {t('chat.target.replyTo', { what: replyLabel || t('chat.target.lastComment') })}
              </span>
            </button>
            <button
              type="button"
              onClick={onChooseGeneral}
              aria-pressed={replyMode === 'general'}
              className={`rounded-full px-2.5 py-1 border text-xs font-medium ${
                replyMode === 'general'
                  ? 'bg-durazno-50 border-primary-600 text-primary-700'
                  : 'bg-white border-gray-300 text-texto2'
              }`}
            >
              {t('chat.target.general')}
            </button>
          </div>
          {replyMode === 'auto' && (
            <p className="text-[11px] text-texto3 line-clamp-1 break-words pl-1">
              “{replyTo.body}”
            </p>
          )}
        </div>
      )}
      {match && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-texto2">
          <Dumbbell size={13} className="text-primary-700" aria-hidden="true" />
          <span>
            {t('chat.detect.mentions')} <b className="text-tinta">{match.name}</b>
          </span>
          <button
            type="button"
            onClick={() => setAlsoPlan((v) => !v)}
            aria-pressed={planOn}
            className={`rounded-full px-2.5 py-1 border text-xs font-medium ${
              planOn
                ? 'bg-durazno-50 border-primary-600 text-primary-700'
                : 'bg-white border-gray-300 text-texto2'
            }`}
          >
            {planOn ? '✓ ' : ''}
            {t('chat.detect.alsoPlan')}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(match.id)}
            className="rounded-full px-2.5 py-1 border border-gray-300 bg-white text-xs"
          >
            {t('chat.detect.notThat')}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {privateMode && (
          <span
            className="w-9 h-9 rounded-full border border-durazno-200 text-primary-700 flex items-center justify-center flex-shrink-0"
            title={t('chat.privateNote')}
          >
            <Lock size={15} />
          </span>
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
          placeholder={privateMode ? t('chat.placeholderPrivate') : t('chat.placeholder')}
          className="input flex-1 resize-none min-h-[42px] text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending || disabled}
          className="w-10 h-10 rounded-full bg-primary-700 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  )
}
