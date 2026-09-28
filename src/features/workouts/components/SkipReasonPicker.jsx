import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SKIP_REASONS_OFFERED, SKIP_NOTE_MAX } from '../completionRules'

// ============================================================
// SkipReasonPicker — "¿Por qué no lo hiciste?" (v59, 2026-09-28)
// ------------------------------------------------------------
// Compartido por la tarjeta de fuerza y las de bloque (circuito y
// aeróbico), para que las tres ofrezcan los mismos motivos.
//
// Un toque sobre el motivo guarda, salvo "otro": ese abre un campo corto
// opcional y guarda con "Guardar" (con o sin texto). La nota viaja como
// segundo argumento de onPick.
//
// Props:
//   onPick     (reason, note|null) => void
//   onCancel   () => void
//   saving     boolean
//   coachMode  boolean — tercera persona
// ============================================================
export default function SkipReasonPicker({ onPick, onCancel, saving = false, coachMode = false }) {
  const { t } = useTranslation()
  const [otherOpen, setOtherOpen] = useState(false)
  const [note, setNote] = useState('')
  const tv = (key) => t(coachMode ? `${key}Coach` : key)

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-700 font-medium">{tv('workout.skipReasonPrompt')}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {SKIP_REASONS_OFFERED.map((r) =>
          r === 'other' && otherOpen ? (
            <div key={r} className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-2">
              <p className="text-sm font-medium text-gray-700">
                {t(coachMode ? `workout.skipReasonCoach.${r}` : `workout.skipReason.${r}`)}
              </p>
              <textarea
                className="input-field text-sm resize-none"
                rows={2}
                autoFocus
                maxLength={SKIP_NOTE_MAX}
                placeholder={tv('workout.skipNotePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => onPick('other', note.trim() || null)}
                className="btn-primary w-full text-sm disabled:opacity-50"
              >
                {t('workout.skipNoteSave')}
              </button>
            </div>
          ) : (
            <button
              key={r}
              type="button"
              disabled={saving}
              onClick={() => (r === 'other' ? setOtherOpen(true) : onPick(r, null))}
              className="btn-secondary text-sm text-left disabled:opacity-50"
            >
              {t(coachMode ? `workout.skipReasonCoach.${r}` : `workout.skipReason.${r}`)}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-gray-500 underline underline-offset-2"
      >
        {t('common.cancel')}
      </button>
    </div>
  )
}

// Motivo + nota de un omitido ya guardado, y el aviso de que la coach se
// enteró cuando fue "no sabía cómo hacerlo" (solo en la voz de la persona:
// si registró la coach, el trigger no avisa).
export function SkippedReasonLines({ reason, note, coachMode = false }) {
  const { t } = useTranslation()
  if (!reason && !note) return null
  return (
    <>
      {reason && (
        <p className="text-xs text-amber-700">
          {t(coachMode ? `workout.skipReasonCoach.${reason}` : `workout.skipReason.${reason}`)}
          {note && <span className="italic"> · «{note}»</span>}
        </p>
      )}
      {reason === 'unclear' && !coachMode && (
        <p className="text-xs text-amber-800 font-medium">{t('workout.skipUnclearNotice')}</p>
      )}
    </>
  )
}
