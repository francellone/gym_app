import { useTranslation } from 'react-i18next'
import { CheckCircle2, MinusCircle, Pencil } from 'lucide-react'
import RPEScale from './RPEScale'
import { SKIP_REASONS } from '../completionRules'

// ============================================================
// BlockConfirmActions — las tres salidas de un BLOQUE (circuito / aeróbico)
// ------------------------------------------------------------
// v54. Misma idea que la tarjeta de fuerza, un nivel más arriba: un solo
// confirmar para todo el bloque (despliega el PSE del bloque y el toque
// sobre el número guarda), ajustar (abre los campos) y no lo hice (motivo).
//
// Es presentacional: el padre decide qué se guarda. `pendingAction` vive en
// el padre para que el círculo del header pueda abrir directo el PSE.
//
// Props:
//   pendingAction     null | 'confirm' | 'skip'
//   onPendingChange   (next) => void
//   canConfirm        boolean — hay algo prescripto que confirmar
//   confirmHint       string | null — aviso debajo de la lista (ej. "sin peso: …")
//   onConfirm         (pse) => Promise
//   onAdjust          () => void
//   onSkip            (reason) => Promise
//   saving            boolean
//   coachMode         boolean — tercera persona
//   pseVariant        'circuit' | 'cardio' (los descriptores del RPEScale)
// ============================================================
export default function BlockConfirmActions({
  pendingAction,
  onPendingChange,
  canConfirm,
  confirmHint = null,
  onConfirm,
  onAdjust,
  onSkip,
  saving = false,
  coachMode = false,
  pseVariant = 'circuit',
}) {
  const { t } = useTranslation()
  const tv = (key, opts) => t(coachMode ? `${key}Coach` : key, opts)

  if (pendingAction === 'confirm') {
    return (
      <div className="space-y-2">
        <RPEScale
          variant={pseVariant}
          label={tv('workout.confirmPsePrompt')}
          value={null}
          onChange={(n) => {
            if (!saving) onConfirm(n)
          }}
        />
        <button
          type="button"
          onClick={() => onPendingChange(null)}
          className="text-xs text-gray-500 underline underline-offset-2"
        >
          {t('common.cancel')}
        </button>
      </div>
    )
  }

  if (pendingAction === 'skip') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-700 font-medium">{tv('workout.skipReasonPrompt')}</p>
        <div className="grid grid-cols-1 gap-1.5">
          {SKIP_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={saving}
              onClick={() => onSkip(r)}
              className="btn-secondary text-sm text-left disabled:opacity-50"
            >
              {t(coachMode ? `workout.skipReasonCoach.${r}` : `workout.skipReason.${r}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onPendingChange(null)}
          className="text-xs text-gray-500 underline underline-offset-2"
        >
          {t('common.cancel')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {confirmHint && <p className="text-[11px] text-amber-700">{confirmHint}</p>}
      <div className="grid grid-cols-1 gap-2">
        {canConfirm && (
          <button
            type="button"
            onClick={() => onPendingChange('confirm')}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <CheckCircle2 size={16} />
            {tv('workout.confirmAsPrescribed')}
          </button>
        )}
        <button
          type="button"
          onClick={onAdjust}
          className={`w-full flex items-center justify-center gap-2 text-sm ${
            canConfirm ? 'btn-secondary' : 'btn-primary'
          }`}
        >
          <Pencil size={15} />
          {canConfirm ? tv('workout.adjust') : t('workout.logBlock')}
        </button>
        <button
          type="button"
          onClick={() => onPendingChange('skip')}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1.5"
        >
          <MinusCircle size={15} />
          {tv('workout.didNotDo')}
        </button>
      </div>
    </div>
  )
}
