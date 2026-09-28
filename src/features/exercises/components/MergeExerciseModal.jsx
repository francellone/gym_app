import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { AlertTriangle, GitMerge, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchUsage, usageSummary } from '../exerciseUsage'
import { compareForMerge } from '../mergeFill'

// ============================================================
// Fusionar un ejercicio duplicado en otro (v46, decisión D2)
// ------------------------------------------------------------
// `from` es el duplicado que va a desaparecer (queda como lápida archivada
// con merged_into_id). El destino se elige acá. Antes de confirmar se muestra
// el impacto real leído de exercise_usage(): planes, alumnas y registros que
// van a pasar a leerse como el destino.
//
// Lo que NO cambia con la fusión: la prescripción de cada casillero (series,
// reps, kilos, descanso) vive en plan_exercises y se conserva. Cambia la
// identidad (nombre, video, nota técnica) y se une el historial.
// ============================================================

// Etiqueta: coach.exercises.merge.outcome.<clave>
const OUTCOME = {
  same: { cls: 'bg-gray-100 text-gray-600' },
  keep: { cls: 'bg-gray-100 text-gray-600' },
  fill: { cls: 'bg-emerald-50 text-emerald-700' },
  drop: { cls: 'bg-amber-50 text-amber-700' },
}

export default function MergeExerciseModal({
  from,
  into: initialInto = null,
  exercises,
  onClose,
  onMerged,
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [into, setInto] = useState(initialInto)
  const [fromUsage, setFromUsage] = useState(null)
  const [intoUsage, setIntoUsage] = useState({ id: null, usage: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchUsage(from.id)
      .then((u) => alive && setFromUsage(u))
      .catch(() => alive && setFromUsage(null))
    return () => {
      alive = false
    }
  }, [from.id])

  useEffect(() => {
    if (!into) return
    let alive = true
    fetchUsage(into.id)
      .then((u) => alive && setIntoUsage({ id: into.id, usage: u }))
      .catch(() => alive && setIntoUsage({ id: into.id, usage: null }))
    return () => {
      alive = false
    }
  }, [into])

  const intoUsageReady = into && intoUsage.id === into.id ? intoUsage.usage : null

  // Destinos posibles: activos, que no sean lápidas ni el propio origen.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises
      .filter((e) => e.id !== from.id && !e.archived_at && !e.merged_into_id)
      .filter((e) => !q || (e.name || '').toLowerCase().includes(q))
      .slice(0, 30)
  }, [exercises, from.id, search])

  async function handleConfirm() {
    if (!into) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc('merge_exercises', {
        p_from: from.id,
        p_into: into.id,
      })
      if (e) throw e
      onMerged?.({ from, into, counts: data })
    } catch (err) {
      setError(err.message || t('coach.exercises.merge.error'))
      setLoading(false)
    }
  }

  const fromParts = usageSummary(fromUsage, t)
  const intoParts = usageSummary(intoUsageReady, t)
  const comparison = useMemo(() => (into ? compareForMerge(from, into) : []), [from, into])

  return (
    <div
      className="fixed inset-0 z-50 bg-velo/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge size={16} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900 text-sm">{t('coach.exercises.merge.title')}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-500 mb-0.5">{t('coach.exercises.merge.fromHeading')}</p>
            <p className="font-semibold text-sm text-gray-900 break-words">{from.name}</p>
            <p className="text-xs text-gray-600 mt-1">
              {fromUsage === null
                ? t('coach.exercises.merge.calculatingImpact')
                : fromParts.length === 0
                  ? t('coach.exercises.merge.fromUnused')
                  : t('coach.exercises.merge.fromUsedIn', { parts: fromParts.join(', ') })}
            </p>
          </div>

          <div className="space-y-2">
            <label className="label">{t('coach.exercises.merge.intoLabel')}</label>
            {into ? (
              <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 break-words">{into.name}</p>
                  <p className="text-xs text-gray-600">
                    {intoUsageReady === null
                      ? t('coach.exercises.merge.calculating')
                      : intoParts.length === 0
                        ? t('coach.exercises.merge.intoUnused')
                        : t('coach.exercises.merge.intoUsedIn', { parts: intoParts.join(', ') })}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs px-2 flex-shrink-0"
                  onClick={() => setInto(null)}
                  disabled={loading}
                >
                  {t('coach.exercises.merge.change')}
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    className="input pl-9"
                    placeholder={t('coach.exercises.merge.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {candidates.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {t('coach.exercises.merge.noResults')}
                    </p>
                  ) : (
                    candidates.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setInto(e)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 break-words"
                      >
                        {e.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {into && comparison.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <p className="text-xs font-semibold text-gray-700 px-3 py-2 bg-gray-50 border-b border-gray-100">
                {t('coach.exercises.merge.whatStays')}
              </p>
              <ul className="divide-y divide-gray-100">
                {comparison.map((row) => (
                  <li key={row.key} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">{t(row.labelKey)}</span>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME[row.outcome].cls}`}
                      >
                        {t(`coach.exercises.merge.outcome.${row.outcome}`)}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-0.5 break-words line-clamp-2">
                      {String(row.outcome === 'fill' ? row.from : row.into)}
                    </p>
                    {row.outcome === 'drop' && (
                      <p className="text-gray-400 mt-0.5 break-words line-clamp-2 line-through">
                        {String(row.from)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {into && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <Trans
                  i18nKey="coach.exercises.merge.warning"
                  values={{ name: into.name }}
                  components={{ b: <strong /> }}
                />
              </p>
            </div>
          )}

          {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

          <div className="flex gap-2 justify-end pt-1">
            <button className="btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleConfirm}
              disabled={!into || loading || fromUsage === null}
            >
              <GitMerge size={15} />
              {loading ? t('coach.exercises.merge.merging') : t('coach.exercises.merge.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
