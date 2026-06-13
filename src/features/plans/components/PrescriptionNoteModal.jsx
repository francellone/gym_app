import { useState } from 'react'
import { TrendingUp, X, ArrowRight, Check } from 'lucide-react'
import { PRESCRIPTION_FIELD_KEYS, PRESCRIPTION_FIELD_LABELS_ES } from '../prescriptionHistory'

// ============================================================
// PrescriptionNoteModal (doc 48)
// ------------------------------------------------------------
// Se abre tras guardar el plan de una alumna (clon) cuando cambió la
// prescripción de uno o más ejercicios (series/reps/peso/descanso/PSE).
// El cambio YA quedó registrado en plan_exercise_prescription_history; este
// modal solo permite adjuntarle un MOTIVO opcional ("progresión", etc.).
//
// Props:
//   changes   [{ exerciseName, changes: { fieldKey: {old,new} } }]
//   saving    bool
//   onConfirm(note)  guarda el motivo en las filas recién creadas y navega
//   onSkip()         omite el motivo (el cambio igual quedó registrado) y navega
// ============================================================
export default function PrescriptionNoteModal({ changes = [], saving = false, onConfirm, onSkip }) {
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">Cambiaste el objetivo del plan</h3>
              <p className="text-sm text-gray-600 mt-1">
                Quedó registrado en el historial del plan. Podés dejar un motivo (opcional) para
                tener la trazabilidad del cambio.
              </p>
            </div>
          </div>

          {/* Resumen de cambios */}
          <div className="space-y-2">
            {changes.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                <p className="text-sm font-medium text-gray-800 truncate">{item.exerciseName}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PRESCRIPTION_FIELD_KEYS.filter((k) => item.changes[k]).map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-700"
                    >
                      <span className="text-gray-400">{PRESCRIPTION_FIELD_LABELS_ES[k]}</span>
                      <span className="text-gray-500 line-through">{item.changes[k].old}</span>
                      <ArrowRight size={11} className="text-emerald-500" />
                      <span className="text-emerald-700 font-semibold">{item.changes[k].new}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Motivo opcional */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Motivo (opcional)
            </label>
            <textarea
              className="input mt-1.5 w-full resize-none"
              rows={2}
              placeholder="Ej: progresión, viene muy bien, ajuste por molestia…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSkip}
              disabled={saving}
              className="btn-secondary flex-1 text-sm"
              type="button"
            >
              Omitir
            </button>
            <button
              onClick={() => onConfirm(note)}
              disabled={saving}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
              type="button"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={14} /> Guardar motivo
                </>
              )}
            </button>
          </div>
        </div>

        {!saving && (
          <button
            onClick={onSkip}
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
            type="button"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
