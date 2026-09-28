import { useState } from 'react'
import { RefreshCw, X, AlertTriangle, Check, Users } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { reassignTemplate } from '../assignmentHelpers'
import { supabase } from '@/lib/supabase'

// ============================================================
// ReassignTemplateModal (doc 40)
// ------------------------------------------------------------
// Aviso + circuito de re-asignación tras editar un template que tiene
// asignaciones vivas. Editar el template NO actualiza las copias ya
// asignadas (modelo template-clon, foto congelada). Este modal lista las
// alumnas afectadas y permite re-asignarles la versión nueva.
//
// Props:
//   templateId   uuid del template recién editado
//   templateTitle texto para el copy
//   assignees    [{ assignmentId, studentId, studentName, resultCount, ... }]
//   onClose()    cerrar sin más acción (navegar)
//   onDone()     terminó (con o sin re-asignaciones) → navegar
// ============================================================
export default function ReassignTemplateModal({
  templateId,
  templateTitle,
  assignees = [],
  onClose,
  onDone,
}) {
  const { t } = useTranslation()
  // Por default todas marcadas: lo más común es querer propagar el cambio.
  const [selected, setSelected] = useState(() => new Set(assignees.map((a) => a.assignmentId)))
  const [running, setRunning] = useState(false)
  // assignmentId → 'ok' | { error }
  const [results, setResults] = useState({})
  const [finished, setFinished] = useState(false)

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleReassign() {
    const targets = assignees.filter((a) => selected.has(a.assignmentId))
    if (targets.length === 0) return
    setRunning(true)
    const acc = {}
    for (const assignee of targets) {
      try {
        await reassignTemplate(supabase, { templateId, assignee })
        acc[assignee.assignmentId] = 'ok'
      } catch (err) {
        acc[assignee.assignmentId] = { error: err.message || t('coach.planEditor.reassign.error') }
      }
      setResults({ ...acc })
    }
    setRunning(false)
    setFinished(true)
  }

  const okCount = Object.values(results).filter((r) => r === 'ok').length
  const errCount = Object.values(results).filter((r) => r && r !== 'ok').length
  const selectedCount = selected.size
  // #4 (doc 41): re-asignar un plan de entrenamiento reinicia el plan en curso.
  const hasTraining = assignees.some((a) => a.planType && a.planType !== 'evaluation')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo/40 p-4">
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">
                {t('coach.planEditor.reassign.title')}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                <Trans
                  i18nKey={
                    templateTitle
                      ? 'coach.planEditor.reassign.body'
                      : 'coach.planEditor.reassign.bodyNoTitle'
                  }
                  values={{ title: templateTitle?.trim() }}
                  components={{ strong: <strong /> }}
                />
              </p>
            </div>
          </div>

          {/* #4 (doc 41): aviso reforzado para planes de entrenamiento */}
          {!finished && hasTraining && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              <Trans
                i18nKey="coach.planEditor.reassign.trainingWarning"
                components={{ strong: <strong /> }}
              />
            </div>
          )}

          {!finished ? (
            <>
              {/* Lista de alumnas */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  <Users size={13} />{' '}
                  {t('coach.planEditor.reassign.affected', { count: assignees.length })}
                </div>
                {assignees.map((a) => {
                  const checked = selected.has(a.assignmentId)
                  return (
                    <button
                      key={a.assignmentId}
                      type="button"
                      onClick={() => toggle(a.assignmentId)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-colors ${
                        checked
                          ? 'border-purple-300 bg-purple-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-purple-600' : 'border-2 border-gray-300'
                        }`}
                      >
                        {checked && <Check size={13} className="text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {a.studentName}
                        </p>
                        {a.resultCount > 0 && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            {t('coach.planEditor.reassign.logsKept', { count: a.resultCount })}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Acciones */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={running}
                  className="btn-secondary flex-1 text-sm"
                  type="button"
                >
                  {t('coach.planEditor.reassign.notNow')}
                </button>
                <button
                  onClick={handleReassign}
                  disabled={running || selectedCount === 0}
                  className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
                  type="button"
                >
                  {running ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <RefreshCw size={14} /> {t('coach.planEditor.reassign.reassign')}
                      {selectedCount > 0 ? ` (${selectedCount})` : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Resumen final */}
              <div className="space-y-2">
                {okCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl p-3">
                    <Check size={16} />
                    <span>{t('coach.planEditor.reassign.done', { count: okCount })}</span>
                  </div>
                )}
                {errCount > 0 && (
                  <div className="text-sm text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle size={16} />{' '}
                      {t('coach.planEditor.reassign.failed', { count: errCount })}
                    </div>
                    {assignees
                      .filter((a) => results[a.assignmentId] && results[a.assignmentId] !== 'ok')
                      .map((a) => (
                        <p key={a.assignmentId} className="text-xs">
                          {a.studentName}: {results[a.assignmentId].error}
                        </p>
                      ))}
                  </div>
                )}
              </div>
              <button onClick={onDone} className="btn-primary w-full text-sm" type="button">
                {t('coach.planEditor.reassign.finish')}
              </button>
            </>
          )}
        </div>

        {/* Cerrar (esquina) — solo si no está corriendo */}
        {!running && !finished && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600"
            aria-label={t('common.close')}
            type="button"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
