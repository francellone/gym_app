import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { WELLBEING_METRICS, wellbeingColor } from '@/features/wellbeing/components/WellbeingModal'

// ============================================================
// Card de Wellbeing diario (siempre visible, opcional)
// ============================================================
// Aparece en TodayWorkoutPage como tarjeta clickeable. Si el día ya
// tiene wellbeing_log, muestra los emojis con sus valores y un
// promedio "ponderado" (positivos cuentan tal cual, negativos
// invertidos `11 - v`). Si no, muestra estado pendiente.
export default function WellbeingCard({ wellbeing, onOpen, isToday }) {
  const { t } = useTranslation()
  const completed = !!wellbeing

  // Promedio "ponderado": los positivos cuentan tal cual; los negativos invertidos
  // (10 - val) para que un único score 1–10 represente "mejor estado" cuando es alto.
  let avgScore = null
  if (completed) {
    const scores = []
    for (const m of WELLBEING_METRICS) {
      const v = wellbeing[m.key]
      if (typeof v === 'number') {
        scores.push(m.positive ? v : 11 - v)
      }
    }
    if (scores.length > 0) {
      avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
        completed
          ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
          : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            completed ? 'bg-amber-100' : 'bg-amber-200'
          }`}
        >
          <span className="text-xl">🌟</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-gray-900">{t('workout.dailyWellbeing')}</p>
            {completed ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                {t('workout.completedCheck')}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">
                {t('workout.pending')}
              </span>
            )}
          </div>

          {completed ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {WELLBEING_METRICS.map((m) => {
                const val = wellbeing[m.key]
                if (val == null) return null
                return (
                  <span
                    key={m.key}
                    title={`${t(m.labelKey)}: ${val}/10`}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${wellbeingColor(val, m.positive)}`}
                  >
                    {m.emoji} {val}
                  </span>
                )
              })}
              {avgScore !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 ml-1">
                  {t('workout.averageScore', { value: avgScore })}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700/90 mt-0.5">
              {isToday ? t('workout.wellbeingPromptToday') : t('workout.wellbeingPromptPast')}
            </p>
          )}
        </div>

        <ChevronRight size={18} className="text-amber-400 flex-shrink-0" />
      </div>
    </button>
  )
}
