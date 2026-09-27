import { useEffect, useState } from 'react'
import { AlertTriangle, Archive, Trash2, X } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import {
  deletePlan,
  fetchPlanUsage,
  planLifecycleMode,
  planUsageSummary,
  setPlanArchived,
} from '../planLifecycle'

/**
 * Modal para sacar un plan del recetario (v47, decisión D4).
 *
 * Lee plan_usage() y decide solo:
 *   - con asignación activa → no se puede (primero reemplazar/cerrar desde la ficha)
 *   - con cualquier hecho o clon → se ARCHIVA (todo se conserva, reversible)
 *   - sin nada → se elimina
 *
 * Props:
 *   plan     – { id, title, plan_type, is_template }
 *   onClose  – cerrar sin hacer nada
 *   onDone   – ({ mode: 'archived' | 'deleted', plan }) tras la acción
 */
export default function DeletePlanModal({ plan, onClose, onDone }) {
  const { t } = useTranslation()
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchPlanUsage(plan.id)
      .then((u) => alive && setUsage(u))
      .catch(
        (err) => alive && setError(err.message || t('coach.planEditor.deletePlan.loadUsageError'))
      )
    return () => {
      alive = false
    }
  }, [plan.id, t])

  if (!plan) return null

  const isEval = plan?.plan_type === 'evaluation'
  const mode = planLifecycleMode(usage)
  const partes = planUsageSummary(usage, t)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'archive') {
        await setPlanArchived(plan.id, true)
        onDone?.({ mode: 'archived', plan })
      } else if (mode === 'delete') {
        await deletePlan(plan.id)
        onDone?.({ mode: 'deleted', plan })
      }
    } catch (err) {
      setError(
        err.i18nKey ? t(err.i18nKey) : err.message || t('coach.planEditor.deletePlan.genericError')
      )
      setLoading(false)
    }
  }

  const deleteLabel = t(
    isEval
      ? 'coach.planEditor.deletePlan.titleDeleteEval'
      : 'coach.planEditor.deletePlan.titleDeletePlan'
  )
  const archiveLabel = t(
    isEval
      ? 'coach.planEditor.deletePlan.titleArchiveEval'
      : 'coach.planEditor.deletePlan.titleArchivePlan'
  )
  const title =
    mode === 'delete'
      ? deleteLabel
      : mode === 'blocked'
        ? t('coach.planEditor.deletePlan.titleBlocked')
        : archiveLabel
  const boldTitle = { b: <span className="font-semibold" />, strong: <strong /> }

  return (
    <div
      className="fixed inset-0 z-50 bg-tinta/40 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {mode === 'delete' ? (
              <Trash2 size={16} className="text-red-500" />
            ) : (
              <Archive size={16} className="text-gray-600" />
            )}
            <h2 className="font-bold text-gray-900 text-sm">
              {mode ? title : t('coach.planEditor.deletePlan.titleLoading')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {!mode && !error && (
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
            </div>
          )}

          {mode === 'blocked' && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <Trans
                  i18nKey="coach.planEditor.deletePlan.blocked"
                  values={{
                    title: plan.title,
                    assignments: t('coach.planEditor.deletePlan.activeAssignments', {
                      count: usage.active_assignments,
                    }),
                  }}
                  components={boldTitle}
                />
              </p>
            </div>
          )}

          {mode === 'archive' && (
            <>
              <p className="text-sm text-gray-700">
                <Trans
                  i18nKey="coach.planEditor.deletePlan.archiveBody"
                  values={{ title: plan.title }}
                  components={boldTitle}
                />
              </p>
              {partes.length > 0 && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">
                    {t('coach.planEditor.deletePlan.kept')}
                  </p>
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {partes.map((p) => (
                      <li key={p}>· {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {usage.is_template && usage.clone_active_assignments > 0 && (
                <p className="text-xs text-gray-500">
                  {t('coach.planEditor.deletePlan.clonesStillActive', {
                    count: usage.clone_active_assignments,
                  })}
                </p>
              )}
            </>
          )}

          {mode === 'delete' && (
            <>
              <p className="text-sm text-gray-700">
                <Trans
                  i18nKey="coach.planEditor.deletePlan.confirmDelete"
                  values={{ title: plan.title }}
                  components={boldTitle}
                />
              </p>
              <p className="text-xs text-gray-400">{t('coach.planEditor.deletePlan.deleteNote')}</p>
            </>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

          {/* Botones */}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1 text-sm">
              {mode === 'blocked'
                ? t('coach.planEditor.deletePlan.understood')
                : t('common.cancel')}
            </button>
            {mode === 'archive' && (
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 text-sm bg-primary-600 text-white font-bold rounded-xl px-4 py-2.5 hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Archive size={13} />
                    {archiveLabel}
                  </>
                )}
              </button>
            )}
            {mode === 'delete' && (
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 text-sm bg-red-600 text-white font-medium rounded-xl px-4 py-2.5 hover:bg-red-700 active:bg-red-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 size={13} />
                    {deleteLabel}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
