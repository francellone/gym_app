// Caja para escribir.
// - "Va a:": a qué queda asociado el mensaje (General, un comentario sin
//   responder u otro mensaje que se elige tocándolo). El destino se congela
//   apenas hay texto, para que no cambie si entra un mensaje mientras se escribe.
// - Para la coach: si el texto nombra un ejercicio del catálogo, ofrece
//   guardarlo también en el plan apenas se envía.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Send,
  Dumbbell,
  Lock,
  X,
  CornerDownRight,
  ChevronDown,
  MousePointerClick,
  MessageSquare,
} from 'lucide-react'
import { detectExercise } from '../chatModel'

function TargetPicker({ pending, labelOf, current, onChoose, onPickOther, onClose }) {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 bg-velo/30 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-target-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-3 pb-5 sm:pb-3 flex flex-col gap-1 max-h-[80dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <h2 id="chat-target-title" className="text-sm font-bold text-tinta">
            {t('chat.target.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.cancel')}
            className="p-1 text-texto2"
          >
            <X size={16} />
          </button>
        </div>
        <Row
          active={!current}
          Icon={MessageSquare}
          title={t('chat.target.general')}
          hint={t('chat.target.generalHint')}
          onClick={() => onChoose(null)}
        />
        {pending.length > 0 && (
          <p className="px-2 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-texto3">
            {t('chat.target.unanswered')}
          </p>
        )}
        {pending.map((n) => (
          <Row
            key={n.id}
            active={current?.id === n.id}
            Icon={CornerDownRight}
            title={labelOf(n) || t('chat.target.comment')}
            hint={`“${n.body}”`}
            onClick={() => onChoose(n)}
          />
        ))}
        <Row
          Icon={MousePointerClick}
          title={t('chat.target.other')}
          hint={t('chat.target.otherHint')}
          onClick={onPickOther}
        />
      </div>
    </div>
  )
}

function Row({ active, Icon, title, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(active)}
      className={`w-full text-left flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${
        active ? 'bg-durazno-50 ring-1 ring-primary-600' : 'hover:bg-durazno-50/60'
      }`}
    >
      <Icon size={15} className="mt-0.5 text-texto2 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-tinta break-words">{title}</span>
        {hint && <span className="block text-xs text-texto2 line-clamp-2 break-words">{hint}</span>}
      </span>
    </button>
  )
}

export default function ChatComposer({
  onSend,
  catalog,
  privateMode = false,
  target, // nota a la que va como respuesta, o null (General)
  targetIsAuto = false, // vino marcada sola
  suggestion, // (persona) comentario sugerido, sin marcar
  pending = [],
  labelOf = () => '',
  onChooseTarget, // (note|null) => void
  onPickOther,
  picking = false,
  onCancelPicking,
  onTypingChange,
  disabled = false,
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [alsoPlan, setAlsoPlan] = useState(false)
  const [dismissed, setDismissed] = useState(null)
  const [debounced, setDebounced] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const ref = useRef(null)
  const hasText = text.trim().length > 0

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(id)
  }, [text])

  useEffect(() => {
    onTypingChange?.(hasText)
  }, [hasText, onTypingChange])

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
    if (target && !targetIsAuto) ref.current?.focus()
  }, [target, targetIsAuto])

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

  const targetLabel = target ? labelOf(target) || t('chat.target.comment') : null

  return (
    <div className="border-t border-linea bg-white px-3 sm:px-4 pt-2 pb-3 flex flex-col gap-2">
      {picking && (
        <div className="flex items-center gap-2 text-xs text-primary-700 bg-durazno-50 rounded-lg px-2.5 py-1.5">
          <MousePointerClick size={13} aria-hidden="true" />
          <p className="flex-1">{t('chat.target.pickHint')}</p>
          <button type="button" onClick={onCancelPicking} className="font-medium">
            {t('chat.cancel')}
          </button>
        </div>
      )}

      {!privateMode && !picking && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-texto2 min-w-0">
            <span className="flex-shrink-0">{t('chat.target.goesTo')}</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 border text-xs font-medium min-w-0 max-w-full ${
                target
                  ? 'bg-durazno-50 border-primary-600 text-primary-700'
                  : 'bg-white border-gray-300 text-texto2'
              }`}
              aria-haspopup="dialog"
            >
              {target && <CornerDownRight size={12} aria-hidden="true" className="flex-shrink-0" />}
              <span className="truncate">
                {target
                  ? t('chat.target.replyTo', { what: targetLabel })
                  : t('chat.target.general')}
              </span>
              <ChevronDown size={12} aria-hidden="true" className="flex-shrink-0" />
            </button>
            {target && (
              <button
                type="button"
                onClick={() => onChooseTarget(null)}
                className="p-1 rounded-full text-texto3 hover:text-tinta flex-shrink-0"
                aria-label={t('chat.target.toGeneral')}
                title={t('chat.target.toGeneral')}
              >
                <X size={13} />
              </button>
            )}
            {!target && suggestion && (
              <button
                type="button"
                onClick={() => onChooseTarget(suggestion)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 border border-dashed border-primary-600 text-primary-700 text-xs min-w-0"
              >
                <CornerDownRight size={12} aria-hidden="true" className="flex-shrink-0" />
                <span className="truncate">
                  {t('chat.target.suggest', {
                    what: labelOf(suggestion) || t('chat.target.comment'),
                  })}
                </span>
              </button>
            )}
          </div>
          {target && (
            <p className="text-[11px] text-texto3 line-clamp-1 break-words pl-1">
              {targetIsAuto ? `${t('chat.target.autoNote')} ` : ''}“{target.body}”
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

      {pickerOpen && (
        <TargetPicker
          pending={pending}
          labelOf={labelOf}
          current={target}
          onChoose={(n) => {
            onChooseTarget(n)
            setPickerOpen(false)
          }}
          onPickOther={() => {
            setPickerOpen(false)
            onPickOther?.()
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
