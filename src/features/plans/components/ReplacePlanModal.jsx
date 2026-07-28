import { useState } from 'react'
import { AlertTriangle, ArrowRight, Copy, Loader, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────
// ReplacePlanModal
//
// Aparece cuando el coach quiere asignar un plan de TRAINING y el
// alumno ya tiene otro de training en estado 'active' o 'paused'.
// El modal le pregunta:
//   - cómo dejar al saliente (reemplazar / pausar)
//   - motivo opcional
//   - atajo: duplicar el plan saliente como base del nuevo
//
// Props:
//   currentAssignment   - asignación vigente (con .plan, .start_date, .status)
//   incomingPlan        - plan a asignar (con .id, .title)
//   onCancel            - cerrar sin hacer nada
//   onConfirm({ outgoingTransition, reason }) - el padre ejecuta DB
//                          outgoingTransition: 'replaced' | 'paused'
//   onDuplicateOutgoing - cierra modal y arranca duplicar el saliente
//   evalCount           - cuántas evaluaciones tiene linkeadas el saliente
// ─────────────────────────────────────────────────────────────
export default function ReplacePlanModal({
  currentAssignment,
  incomingPlan,
  onCancel,
  onConfirm,
  onDuplicateOutgoing,
  evalCount = 0,
}) {
  const [outgoingTransition, setOutgoingTransition] = useState('replaced')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const startDateStr = currentAssignment?.start_date
    ? format(parseISO(currentAssignment.start_date), "d 'de' MMMM yyyy", { locale: es })
    : null

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm({
        outgoingTransition,
        reason: reason.trim() || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Reemplazar plan activo</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Este alumno ya tiene un plan vigente. Decidí qué hacer con él.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="btn-ghost p-1.5 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumen: saliente vs entrante */}
          <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-gray-400 mt-0.5 w-16">Actual</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 break-words">
                  {currentAssignment?.plan?.title || 'Plan actual'}
                </p>
                {startDateStr && (
                  <p className="text-xs text-gray-500">Activo desde {startDateStr}</p>
                )}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-2 flex items-start gap-2">
              <span className="text-xs font-medium text-gray-400 mt-0.5 w-16">Nuevo</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-primary-700 break-words">
                  {incomingPlan?.title || 'Plan nuevo'}
                </p>
                <p className="text-xs text-gray-500">Empieza hoy</p>
              </div>
            </div>
          </div>

          {/* Qué hacer con el saliente */}
          <div>
            <label className="label">¿Qué hacemos con el plan actual?</label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  outgoingTransition === 'replaced'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="outgoing"
                  value="replaced"
                  checked={outgoingTransition === 'replaced'}
                  onChange={() => setOutgoingTransition('replaced')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${outgoingTransition === 'replaced' ? 'text-primary-700' : 'text-gray-700'}`}
                  >
                    Reemplazar
                  </p>
                  <p className="text-xs text-gray-500">
                    Queda como “Reemplazado por {incomingPlan?.title || 'el nuevo'}”. Recomendado.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  outgoingTransition === 'paused'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="outgoing"
                  value="paused"
                  checked={outgoingTransition === 'paused'}
                  onChange={() => setOutgoingTransition('paused')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${outgoingTransition === 'paused' ? 'text-amber-700' : 'text-gray-700'}`}
                  >
                    Pausar
                  </p>
                  <p className="text-xs text-gray-500">
                    Queda en pausa, lo podés reactivar más adelante.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Motivo opcional */}
          <div>
            <label className="label">Motivo (opcional)</label>
            <input
              className="input"
              placeholder="Ej: Pasó a fuerza máxima, lesión, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Atajo: duplicar saliente como base */}
          {onDuplicateOutgoing && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                <Copy size={12} /> Atajo
              </p>
              <p className="text-xs text-blue-700 mt-1">
                ¿Querés usar el plan actual como base del nuevo? Te abre el duplicador con los
                mismos ejercicios, lo editás y volvés acá a asignarlo.
              </p>
              <button
                onClick={onDuplicateOutgoing}
                disabled={submitting}
                className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-900 inline-flex items-center gap-1.5 bg-white border border-blue-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                Duplicar plan actual <ArrowRight size={12} />
              </button>
            </div>
          )}

          {/* Aviso de evaluaciones linkeadas */}
          {evalCount > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-800">
              <p className="font-semibold">Evaluaciones vinculadas</p>
              <p className="mt-1">
                El plan saliente tiene {evalCount} evaluación{evalCount > 1 ? 'es' : ''} vinculada
                {evalCount > 1 ? 's' : ''}.{' '}
                {outgoingTransition === 'replaced'
                  ? 'Quedan como historial en la pestaña Evaluaciones (no se borran).'
                  : 'Las podés seguir viendo en la pestaña Evaluaciones.'}
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} disabled={submitting} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <>Confirmar reemplazo</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
