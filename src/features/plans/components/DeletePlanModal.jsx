import { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

/**
 * Modal de confirmación para eliminar un plan de entrenamiento o evaluación.
 *
 * Props:
 *   plan           – objeto con { id, title, plan_type }
 *   activeStudents – cantidad de alumnos activos asignados al plan
 *   resultCount    – cantidad de resultados de alumnos (solo relevante para evaluaciones)
 *   onClose        – callback para cerrar sin eliminar
 *   onConfirm      – async callback que ejecuta el borrado; recibe plan.id
 */
export default function DeletePlanModal({
  plan,
  activeStudents = 0,
  resultCount = 0,
  onClose,
  onConfirm,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isEval = plan?.plan_type === 'evaluation'

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await onConfirm(plan.id)
    } catch (err) {
      setError(err.message || 'Error al eliminar. Intentá de nuevo.')
      setLoading(false)
    }
  }

  if (!plan) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-red-500" />
            <h2 className="font-bold text-gray-900 text-sm">
              Eliminar {isEval ? 'evaluación' : 'plan'}
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
          <p className="text-sm text-gray-700">
            ¿Seguro que querés eliminar{' '}
            <span className="font-semibold">"{plan.title}"</span>?
          </p>

          {/* Advertencia: alumnos activos */}
          {activeStudents > 0 && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>{activeStudents} alumno{activeStudents > 1 ? 's' : ''}</strong>{' '}
                tiene{activeStudents > 1 ? 'n' : ''} este plan asignado. Al eliminar
                serán desasignados, pero sus registros de entrenamiento se conservarán.
              </p>
            </div>
          )}

          {/* Advertencia: resultados de evaluación */}
          {isEval && resultCount > 0 && (
            <div className="flex gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Hay <strong>{resultCount} resultado{resultCount > 1 ? 's' : ''}</strong>{' '}
                de alumnos vinculados a este protocolo. Los datos de los alumnos
                se conservarán aunque se elimine el protocolo.
              </p>
            </div>
          )}

          {/* Sin advertencias */}
          {activeStudents === 0 && (!isEval || resultCount === 0) && (
            <p className="text-xs text-gray-400">Esta acción no se puede deshacer.</p>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
          )}

          {/* Botones */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-secondary flex-1 text-sm"
            >
              Cancelar
            </button>
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
                  Eliminar {isEval ? 'evaluación' : 'plan'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
