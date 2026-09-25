// ============================================================
// CelebrationOverlay — pinta UNA celebración (toast / sheet / full)
// ------------------------------------------------------------
// Recibe el modelo de celebrationModel.toCelebration y un onDismiss.
// Diseño según la maqueta aprobada por Franco (2026-09-24).
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { CheckCircle2, Medal } from 'lucide-react'
import { dateLocale } from '@/i18n/dateLocale'
import { fireConfetti } from '../confetti'
import { TOAST_MS, BEST_TOAST_MS } from '../celebrationModel'
import { supabase } from '@/lib/supabase'
import { voidPersonalBest } from '../api'
import { requestLogEdit } from '../editRequest'

function useConfetti(item) {
  useEffect(() => {
    if (!item?.confetti) return undefined
    let stop = () => {}
    const id = setTimeout(() => {
      stop = fireConfetti(item.confetti, { originY: item.level === 'toast' ? 0.8 : 0.55 })
    }, 150)
    return () => {
      clearTimeout(id)
      stop()
    }
  }, [item])
}

function useEscape(onDismiss, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss, enabled])
}

function safeFormat(ymd, pattern) {
  try {
    return format(parseISO(String(ymd)), pattern, { locale: dateLocale() })
  } catch {
    return String(ymd || '')
  }
}

function Stats({ stats }) {
  const { t } = useTranslation()
  if (!stats?.length) return null
  return (
    <div className={`grid gap-2 ${stats.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {stats.map((s) => (
        <div key={s.labelKey} className="rounded-xl bg-primary-50 px-3 py-2.5 text-center">
          <span className="block text-xl font-extrabold tabular-nums text-primary-700">
            {s.value}
          </span>
          <span className="text-[11px] text-gray-500">{t(s.labelKey)}</span>
        </div>
      ))}
    </div>
  )
}

function DayToast({ item, onDismiss }) {
  const { t } = useTranslation()
  useEffect(() => {
    const id = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(id)
  }, [onDismiss])
  const date = safeFormat(item.bodyVars?.date, 'EEEE d/M')
  return (
    <div
      className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-md"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="celebrate-up grid w-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 rounded-2xl bg-white p-4 text-left shadow-xl ring-1 ring-black/5"
      >
        <span className="row-span-2 grid h-10 w-10 place-items-center rounded-xl bg-green-100 text-green-700">
          <CheckCircle2 size={22} />
        </span>
        <span className="font-bold text-gray-900">{t(item.titleKey, item.titleVars)}</span>
        <span className="text-[13px] text-gray-600">{t(item.bodyKey, { date })}</span>
      </button>
    </div>
  )
}

// Mejor marca: toast con "¿Es un error?". Primero se ofrece corregir el
// registro (decisión Franco); anular sin tocar el registro queda como
// segunda opción. Al abrir la hoja el toast deja de irse solo.
function BestToast({ item, onDismiss }) {
  const { t, i18n } = useTranslation()
  const [fixing, setFixing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (fixing) return undefined
    const id = setTimeout(onDismiss, BEST_TOAST_MS)
    return () => clearTimeout(id)
  }, [onDismiss, fixing])
  useEscape(onDismiss, fixing)
  const fmt = (n) =>
    Number.isFinite(Number(n)) ? Number(n).toLocaleString(i18n.language) : String(n ?? '')
  const bodyVars = { value: fmt(item.bodyVars?.value), previous: fmt(item.bodyVars?.previous) }

  async function voidBest(reason) {
    if (!item.id) return
    setBusy(true)
    try {
      await voidPersonalBest(supabase, item.id, reason)
    } catch (err) {
      console.warn('[celebrations] no se pudo anular la marca:', err)
    } finally {
      setBusy(false)
    }
  }

  if (fixing) {
    return (
      <div
        className="celebrate-fade fixed inset-0 z-[60] flex items-end bg-gray-900/45"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        onClick={onDismiss}
      >
        <div
          className="celebrate-up mx-auto w-full max-w-lg rounded-t-3xl bg-white px-5 pt-6"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="celebration-title" className="text-xl font-extrabold text-gray-900">
            {t('celebrations.best.fixTitle')}
          </h2>
          <p className="mt-1 text-gray-600">{t('celebrations.best.fixBody', bodyVars)}</p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onDismiss()
                requestLogEdit(item.planExerciseId)
              }}
              className="w-full rounded-xl bg-primary-500 py-3 font-bold text-white hover:bg-primary-600 disabled:opacity-60"
            >
              {t('celebrations.best.fixEdit')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await voidBest('student_void')
                onDismiss()
              }}
              className="w-full rounded-xl border border-gray-300 py-3 font-semibold text-gray-700 disabled:opacity-60"
            >
              {t('celebrations.best.fixVoid')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-md"
      role="status"
      aria-live="polite"
    >
      <div className="celebrate-up grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
        <span className="row-span-3 grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-700">
          <Medal size={22} />
        </span>
        <span className="font-bold text-gray-900">{t(item.titleKey, item.titleVars)}</span>
        <span className="text-[13px] text-gray-600">{t(item.bodyKey, bodyVars)}</span>
        <span className="mt-1 flex gap-4 text-[13px] font-semibold">
          <button type="button" onClick={onDismiss} className="text-primary-700">
            {t('celebrations.best.ok')}
          </button>
          {item.id && (
            <button type="button" onClick={() => setFixing(true)} className="text-gray-500">
              {t('celebrations.best.isError')}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

// Barritas de la racha (una por semana, hasta 12). Si se usó el comodín,
// la última va rayada.
function StreakBars({ weeks, freezeUsed }) {
  const n = Math.min(Math.max(weeks, 0), 12)
  if (n === 0) return null
  return (
    <div className="mt-2 flex gap-1" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className="h-2 flex-1 rounded bg-primary-300"
          style={
            freezeUsed && i === n - 1
              ? { background: 'repeating-linear-gradient(45deg,#fdba74 0 4px,#fff 4px 8px)' }
              : undefined
          }
        />
      ))}
    </div>
  )
}

function WeekSheet({ item, onDismiss }) {
  const { t } = useTranslation()
  const btnRef = useRef(null)
  useEffect(() => btnRef.current?.focus(), [])
  useEscape(onDismiss, true)
  let range = item.eyebrowKey ? t(item.eyebrowKey) : null
  if (item.weekStart) {
    const start = parseISO(item.weekStart)
    range = t('celebrations.week.eyebrow', {
      from: safeFormat(item.weekStart, 'd/M'),
      to: format(addDays(start, 6), 'd/M'),
    })
  }
  return (
    <div
      className="celebrate-fade fixed inset-0 z-[60] flex items-end bg-gray-900/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      onClick={onDismiss}
    >
      <div
        className="celebrate-up mx-auto w-full max-w-lg rounded-t-3xl bg-white px-5 pb-6 pt-6"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {range && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700">{range}</p>
        )}
        <h2 id="celebration-title" className="mt-1 text-2xl font-extrabold text-gray-900">
          {t(item.titleKey, item.titleVars)}
        </h2>
        <p className="mt-1 text-gray-600">{t(item.bodyKey, item.bodyVars)}</p>
        {item.stats?.length > 0 && (
          <div className="mt-4">
            <Stats stats={item.stats} />
          </div>
        )}
        {item.streakWeeks > 0 && (
          <div className="mt-4">
            <p
              className={`text-sm font-bold ${item.streakHighlight ? 'text-primary-700' : 'text-gray-800'}`}
            >
              {t('celebrations.streak.label', { count: item.streakWeeks })}
            </p>
            <StreakBars weeks={item.streakWeeks} freezeUsed={item.showFreezeUsed} />
            {item.freezeEarned && (
              <p className="mt-2 text-[13px] text-gray-600">{t('celebrations.freeze.earned')}</p>
            )}
          </div>
        )}
        <button
          ref={btnRef}
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full rounded-xl bg-primary-500 py-3 font-bold text-white hover:bg-primary-600"
        >
          {t('celebrations.continue')}
        </button>
      </div>
    </div>
  )
}

const PLAN_BG = {
  strong: 'bg-gradient-to-b from-primary-50 to-primary-100',
  good: 'bg-gradient-to-b from-primary-50 to-white',
  gentle: 'bg-gray-50',
}

function PlanScreen({ item, onDismiss }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const btnRef = useRef(null)
  useEffect(() => btnRef.current?.focus(), [])
  useEscape(onDismiss, true)
  const message = item.message?.trim() || t(item.autoMessageKey)
  return (
    <div
      className={`celebrate-fade fixed inset-0 z-[60] overflow-y-auto ${PLAN_BG[item.tone] || PLAN_BG.good}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
    >
      <div
        className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-5 py-8"
        style={{ paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))' }}
      >
        {item.planTitle && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
            {item.planTitle}
          </p>
        )}
        <h2 id="celebration-title" className="text-3xl font-extrabold leading-tight text-gray-900">
          {t(item.titleKey)}
        </h2>
        <p className="text-gray-600">{t(item.bodyKey, item.bodyVars)}</p>
        <Stats stats={item.stats} />
        <div className="rounded-2xl border border-primary-200 bg-white p-4">
          <p className="mb-1 text-xs font-semibold text-primary-800">
            {t('celebrations.plan.messageLabel')}
          </p>
          <p className="whitespace-pre-line italic text-gray-700">{message}</p>
        </div>
        <div className="mt-auto grid gap-2 pt-2">
          <button
            ref={btnRef}
            type="button"
            onClick={() => {
              onDismiss()
              navigate('/student/progress')
            }}
            className="w-full rounded-xl bg-primary-500 py-3 font-bold text-white hover:bg-primary-600"
          >
            {t('celebrations.plan.seeProgress')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl border border-gray-300 py-3 font-semibold text-gray-700"
          >
            {t('celebrations.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CelebrationOverlay({ item, onDismiss }) {
  useConfetti(item)
  if (!item) return null
  if (item.level === 'toast' && item.variant === 'best') {
    return <BestToast item={item} onDismiss={onDismiss} />
  }
  if (item.level === 'toast') return <DayToast item={item} onDismiss={onDismiss} />
  if (item.level === 'sheet') return <WeekSheet item={item} onDismiss={onDismiss} />
  if (item.level === 'full') return <PlanScreen item={item} onDismiss={onDismiss} />
  return null
}
