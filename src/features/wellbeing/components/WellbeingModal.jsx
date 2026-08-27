import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { WELLBEING_METRICS, wellbeingColor } from '../wellbeingMetrics'

// Las métricas y el helper de color viven en ../wellbeingMetrics (módulo puro).
// Se re-exportan acá porque varias vistas los importan desde este archivo.
export { WELLBEING_METRICS, wellbeingColor }

// Color de anillo para botón seleccionado
function ringColor(value, positive) {
  if (positive) {
    if (value >= 8) return 'ring-green-500'
    if (value >= 5) return 'ring-yellow-400'
    return 'ring-red-400'
  } else {
    if (value >= 8) return 'ring-red-500'
    if (value >= 5) return 'ring-orange-400'
    return 'ring-green-500'
  }
}

// ─────────────────────────────────────────────────────────────
// WellbeingModal
//
// Props:
//   userId  – id del alumno (auth.uid())
//   date    – string 'yyyy-MM-dd' del día actual
//   onSave  – callback con el objeto wellbeing guardado
//   onSkip  – callback cuando el alumno omite la encuesta
// ─────────────────────────────────────────────────────────────
export default function WellbeingModal({ userId, date, onSave, onSkip }) {
  const { t } = useTranslation()
  const [values, setValues] = useState({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const filledCount = WELLBEING_METRICS.filter((m) => values[m.key] !== undefined).length
  const allFilled = filledCount === WELLBEING_METRICS.length

  function toggle(key, n) {
    setValues((prev) => ({ ...prev, [key]: prev[key] === n ? undefined : n }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // v34 — guardado vía RPC SECURITY DEFINER (espejo de save_workout_log):
      // autoriza al alumno o a su coach asignado y deriva logged_by/source de
      // auth.uid() (no falsificable). Reemplaza el upsert directo para permitir
      // que el coach cargue el wellbeing del alumno con auditoría.
      const { data, error: err } = await supabase.rpc('save_wellbeing_log', {
        p_user_id: userId,
        p_date: date,
        p_sleep_quality: values.sleep_quality ?? null,
        p_nutrition_quality: values.nutrition_quality ?? null,
        p_hydration_quality: values.hydration_quality ?? null,
        p_energy_level: values.energy_level ?? null,
        p_stress_level: values.stress_level ?? null,
        p_muscle_fatigue: values.muscle_fatigue ?? null,
        p_notes: notes.trim() || null,
      })
      if (err) throw err
      // La RPC devuelve la fila (RETURNS wellbeing_logs). PostgREST puede
      // entregarla como objeto o como array de un elemento según el driver.
      onSave(Array.isArray(data) ? data[0] : data)
    } catch (e) {
      console.error('[WellbeingModal]', e)
      setError(t('wellbeing.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header fijo */}
        <div className="p-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="text-center">
            <div className="text-3xl mb-1">🌟</div>
            <h2 className="font-bold text-gray-900 text-lg">{t('wellbeing.modalTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('wellbeing.modalSubtitle')}</p>
          </div>
          {/* Barra de progreso */}
          <div className="mt-3">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${(filledCount / WELLBEING_METRICS.length) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 text-right mt-1">
              {t('wellbeing.completedCount', {
                filled: filledCount,
                total: WELLBEING_METRICS.length,
              })}
            </p>
          </div>
        </div>

        {/* Métricas con scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {WELLBEING_METRICS.map(
            ({ key, labelKey, emoji, positive, lowLabelKey, highLabelKey }) => {
              const val = values[key]
              return (
                <div key={key}>
                  {/* Fila: emoji + label + badge valor */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg leading-none">{emoji}</span>
                    <span className="text-sm font-semibold text-gray-800 flex-1">
                      {t(labelKey)}
                    </span>
                    {val !== undefined && (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${wellbeingColor(val, positive)}`}
                      >
                        {val}
                      </span>
                    )}
                  </div>

                  {/* Selector 1–10 */}
                  <div className="grid grid-cols-10 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => toggle(key, n)}
                        className={`h-8 rounded-lg text-xs font-bold transition-all ${
                          val === n
                            ? `${wellbeingColor(n, positive)} ring-2 ring-offset-1 ${ringColor(n, positive)} scale-110`
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  {/* Etiquetas extremos */}
                  <div className="flex justify-between text-[10px] text-gray-400 px-0.5 mt-1">
                    <span>{t(lowLabelKey)}</span>
                    <span>{t(highLabelKey)}</span>
                  </div>
                </div>
              )
            }
          )}

          {/* Observaciones */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">
              {t('workout.observations')}{' '}
              <span className="font-normal">{t('wellbeing.optional')}</span>
            </label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder={t('wellbeing.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>

        {/* Botones fijos abajo */}
        <div className="p-5 pt-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={onSkip} className="btn-secondary flex-1 text-sm">
            {t('workout.skip')}
          </button>
          <button
            onClick={handleSave}
            disabled={!allFilled || saving}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              t('wellbeing.saveButton')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
