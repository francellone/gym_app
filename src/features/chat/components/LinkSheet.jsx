// Hoja para guardar un mensaje de la coach en el plan de la persona.
//   mode 'plan': elegir el ejercicio (detectado en el texto o buscado en el
//                catálogo) y dónde queda: en el ejercicio de su plan activo
//                y/o en el ejercicio en todos sus planes.
//   mode 'day':  elegir el día del plan activo.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Search, Check, Loader2 } from 'lucide-react'
import { detectExercise, searchCatalog, dayLetter } from '../chatModel'
import { linkNote } from '../chatApi'

function Option({ checked, disabled, onToggle, title, hint }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      aria-pressed={checked}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
        disabled
          ? 'opacity-55 bg-gray-50 border-gray-300 cursor-not-allowed'
          : checked
            ? 'border-primary-600 bg-durazno-50'
            : 'border-gray-300 bg-white'
      }`}
    >
      <span
        className={`w-[18px] h-[18px] mt-0.5 rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 ${
          checked && !disabled ? 'bg-primary-700 border-primary-700 text-white' : 'border-texto3'
        }`}
      >
        {checked && !disabled && <Check size={12} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-tinta break-words">{title}</span>
        {hint && <span className="block text-xs text-texto2 break-words">{hint}</span>}
      </span>
    </button>
  )
}

export default function LinkSheet({
  note,
  mode = 'plan',
  catalog,
  catalogNames,
  activePlans,
  presetExercise,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation()
  const detected = useMemo(
    () =>
      presetExercise
        ? { match: presetExercise, alternatives: [] }
        : detectExercise(note.body, catalog || []),
    [note.body, catalog, presetExercise]
  )
  const [exercise, setExercise] = useState(detected.match)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(!detected.match)
  const results = useMemo(() => searchCatalog(query, catalog || []), [query, catalog])

  const plans = useMemo(() => activePlans || [], [activePlans])
  const occurrences = useMemo(() => {
    if (!exercise) return []
    const out = []
    for (const p of plans) {
      for (const pe of p.exercises) {
        if (pe.exercise_id === exercise.id && /^day_/.test(pe.section)) out.push({ plan: p, pe })
      }
    }
    return out
  }, [exercise, plans])

  const [pickedPe, setPickedPe] = useState(null) // null = todas las apariciones
  const [inPlan, setInPlan] = useState(true)
  const [inExercise, setInExercise] = useState(true)
  const [dayPlanId, setDayPlanId] = useState(plans[0]?.id || null)
  const dayPlan = plans.find((p) => p.id === dayPlanId) || plans[0]
  const [day, setDay] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const planTitle = (p) => p?.title || t('chat.sheet.activePlan')

  async function save() {
    setSaving(true)
    setError(null)
    const calls = []
    if (mode === 'day') {
      if (!dayPlan || !day) {
        setSaving(false)
        return
      }
      calls.push({ target: 'plan_day', refId: dayPlan.id, section: day })
    } else {
      if (!exercise) {
        setSaving(false)
        return
      }
      if (inPlan && occurrences.length) {
        const chosen = pickedPe ? occurrences.filter((o) => o.pe.id === pickedPe) : occurrences
        for (const o of chosen) calls.push({ target: 'plan_exercise', refId: o.pe.id })
      }
      if (inExercise) calls.push({ target: 'exercise', refId: exercise.id })
    }
    for (const c of calls) {
      const { error: err } = await linkNote({ sourceNoteId: note.id, ...c })
      if (err) {
        setError(t('chat.sheet.saveError'))
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved?.()
  }

  const canSave =
    mode === 'day'
      ? Boolean(dayPlan && day)
      : Boolean(exercise && ((inPlan && occurrences.length) || inExercise))

  return (
    <div
      className="fixed inset-0 z-50 bg-velo/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-link-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="chat-link-title" className="text-base font-bold text-tinta">
            {mode === 'day' ? t('chat.sheet.titleDay') : t('chat.sheet.titlePlan')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.cancel')}
            className="p-1 text-texto2"
          >
            <X size={18} />
          </button>
        </div>
        <p className="bg-durazno-50 rounded-xl px-3 py-2 text-sm text-tinta whitespace-pre-wrap break-words">
          {note.body}
        </p>

        {mode === 'plan' && (
          <>
            <div>
              <p className="label">{t('chat.sheet.exercise')}</p>
              {!searching && exercise ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-300 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-tinta break-words">{exercise.name}</p>
                    <p className="text-xs text-texto2">
                      {exercise.id === detected.match?.id
                        ? t('chat.sheet.detected')
                        : t('chat.sheet.chosen')}
                      {' · '}
                      {occurrences.length
                        ? t('chat.sheet.inActivePlan')
                        : t('chat.sheet.notInActivePlan')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-xs px-2.5 py-1.5"
                    onClick={() => setSearching(true)}
                  >
                    {t('chat.sheet.change')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-texto3"
                      aria-hidden="true"
                    />
                    <label htmlFor="chat-sheet-search" className="sr-only">
                      {t('chat.sheet.searchPlaceholder')}
                    </label>
                    <input
                      id="chat-sheet-search"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('chat.sheet.searchPlaceholder')}
                      className="input pl-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col max-h-48 overflow-y-auto">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setExercise(r)
                          setSearching(false)
                          setPickedPe(null)
                        }}
                        className="text-left text-sm px-2.5 py-2 rounded-lg hover:bg-durazno-50 break-words"
                      >
                        {r.name}
                      </button>
                    ))}
                    {query && !results.length && (
                      <p className="text-xs text-texto2 px-2.5 py-2">{t('chat.sheet.noResults')}</p>
                    )}
                  </div>
                </div>
              )}
              {!searching && detected.alternatives?.length > 0 && (
                <p className="text-xs text-texto2 mt-1.5">
                  {t('chat.sheet.otherOne')}{' '}
                  {detected.alternatives.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ' · '}
                      <button
                        type="button"
                        className="font-medium text-primary-700"
                        onClick={() => {
                          setExercise(a)
                          setPickedPe(null)
                        }}
                      >
                        {catalogNames?.get(a.id) || a.name}
                      </button>
                    </span>
                  ))}
                </p>
              )}
            </div>

            {exercise && (
              <div className="flex flex-col gap-2">
                <p className="label">{t('chat.sheet.where')}</p>
                <Option
                  checked={inPlan && occurrences.length > 0}
                  disabled={!occurrences.length}
                  onToggle={() => setInPlan((v) => !v)}
                  title={t('chat.sheet.inThisPlan')}
                  hint={
                    occurrences.length
                      ? t('chat.sheet.inThisPlanHint', {
                          plan: planTitle(occurrences[0].plan),
                          days: occurrences
                            .map((o) => t('chat.dayShort', { day: dayLetter(o.pe.section) }))
                            .join(', '),
                        })
                      : t('chat.sheet.inThisPlanDisabled')
                  }
                />
                {inPlan && occurrences.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 pl-7">
                    <button
                      type="button"
                      onClick={() => setPickedPe(null)}
                      className={`rounded-full px-2.5 py-1 border text-xs ${!pickedPe ? 'bg-durazno-50 border-primary-600 text-primary-700' : 'border-gray-300'}`}
                    >
                      {t('chat.sheet.allDays')}
                    </button>
                    {occurrences.map((o) => (
                      <button
                        key={o.pe.id}
                        type="button"
                        onClick={() => setPickedPe(o.pe.id)}
                        className={`rounded-full px-2.5 py-1 border text-xs ${pickedPe === o.pe.id ? 'bg-durazno-50 border-primary-600 text-primary-700' : 'border-gray-300'}`}
                      >
                        {t('chat.dayShort', { day: dayLetter(o.pe.section) })}
                      </button>
                    ))}
                  </div>
                )}
                <Option
                  checked={inExercise}
                  onToggle={() => setInExercise((v) => !v)}
                  title={t('chat.sheet.inExercise')}
                  hint={
                    occurrences.length
                      ? t('chat.sheet.inExerciseHint')
                      : t('chat.sheet.inExerciseHintWaiting')
                  }
                />
              </div>
            )}
          </>
        )}

        {mode === 'day' && (
          <div className="flex flex-col gap-2">
            {!plans.length ? (
              <p className="text-sm text-texto2">{t('chat.sheet.noActivePlan')}</p>
            ) : (
              <>
                {plans.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setDayPlanId(p.id)
                          setDay(null)
                        }}
                        className={`rounded-full px-2.5 py-1 border text-xs ${dayPlan?.id === p.id ? 'bg-durazno-50 border-primary-600 text-primary-700' : 'border-gray-300'}`}
                      >
                        {planTitle(p)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="label">{t('chat.sheet.whichDay', { plan: planTitle(dayPlan) })}</p>
                <div className="flex flex-wrap gap-2">
                  {(dayPlan?.sections || []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDay(s)}
                      aria-pressed={day === s}
                      className={`rounded-xl px-3.5 py-2 border text-sm font-medium ${day === s ? 'bg-durazno-50 border-primary-600 text-primary-700' : 'border-gray-300 text-tinta'}`}
                    >
                      {t('chat.dayShort', { day: dayLetter(s) })}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-texto2">{t('chat.sheet.dayHint')}</p>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary text-sm px-4 py-2" onClick={onClose}>
            {t('chat.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-1.5"
            disabled={!canSave || saving}
            onClick={save}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('chat.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
