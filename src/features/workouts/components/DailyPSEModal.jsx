import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PSE_SHORT, pseColor } from '../helpers'

// ============================================================
// Modal de esfuerzo percibido del día (por cada día)
// ============================================================
// Se abre cuando el alumno completa todos los bloques de un día.
// El alumno elige un PSE 1-10 y, opcionalmente, escribe una nota.
// `onSave(effort, notes)` persiste vía RPC en el padre.
export default function DailyPSEModal({ dayLabel, currentEffort, onSave, onClose }) {
  const { t } = useTranslation()
  const [effort, setEffort] = useState(currentEffort ?? null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (effort === null) return
    setSaving(true)
    await onSave(effort, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
        <div className="p-5 space-y-4">
          {/* Encabezado */}
          <div className="text-center">
            <p className="text-3xl mb-1">💪</p>
            <h2 className="font-bold text-gray-900 text-lg">
              {t('workout.dayCompletedExcl', { day: dayLabel })}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t('workout.howWasEffortForDay', { day: dayLabel })}
            </p>
          </div>

          {/* Selector PSE 1–10 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 text-center uppercase tracking-wide">
              {t('workout.perceivedEffortForDay', { day: dayLabel })}
            </p>
            <div className="grid grid-cols-5 gap-2">
              {PSE_SHORT.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setEffort(effort === value ? null : value)}
                  className={`rounded-xl p-2 text-center transition-all ${
                    effort === value
                      ? pseColor(value) + ' ring-2 ring-offset-1 ring-current scale-105'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="block text-base font-bold">{value}</span>
                  <span className="block text-[10px] leading-tight mt-0.5">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 px-1">
              <span>{t('workout.veryEasy')}</span>
              <span>{t('workout.maxEffort')}</span>
            </div>
          </div>

          {/* Muestra la selección */}
          {effort !== null && (
            <div className={`rounded-xl p-2 text-center text-sm font-medium ${pseColor(effort)}`}>
              {t('workout.pseValue', { value: effort })} — {PSE_SHORT[effort - 1]?.label}
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {t('workout.observationsForDay', { day: dayLabel })}
            </label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder={t('workout.howWasYourDayPlaceholder', { day: dayLabel })}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">
              {t('workout.skip')}
            </button>
            <button
              onClick={handleSave}
              disabled={effort === null || saving}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
