import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatShortDate } from '@/i18n/dateLocale'
import { usePlanTargetPerson } from '../PlanTargetPersonContext'

// ============================================================
// "Con cuánto viene esta persona en este ejercicio"
// ------------------------------------------------------------
// Contexto para prescribir, no una prescripción. Aparece solo si el
// plan tiene una persona elegida, y sirve igual prescribas en kilos o
// en % del máximo.
//
// Va en las DOS filas del armador (fuerza y circuito): son componentes
// separados que pintan ejercicios por su cuenta, así que toda feature
// de ejercicio hay que replicarla en ambas.
// ============================================================
export default function StudentExerciseHistoryLine({ exerciseId, compact = false }) {
  const { t } = useTranslation()
  const { studentId, studentName, historyMap, loading } = usePlanTargetPerson()

  if (!studentId || !exerciseId || loading) return null

  const h = historyMap?.get?.(exerciseId)
  const size = compact ? 'text-[10px]' : 'text-[11px]'
  const quien = studentName || t('coach.planEditor.historyLine.thisPerson')

  // Sin registros: también es información — el ejercicio es nuevo para ella.
  if (!h) {
    return (
      <p className={`${size} text-gray-400 flex items-start gap-1 mt-1 leading-snug`}>
        <History size={11} className="mt-px flex-shrink-0" />
        <span>{t('coach.planEditor.historyLine.noLogs', { name: quien })}</span>
      </p>
    )
  }

  const unidad = h.metric === 'kg' ? 'kg' : 'reps'
  const rango =
    h.recentMin === h.recentMax
      ? `${h.recentMax} ${unidad}`
      : `${h.recentMin}–${h.recentMax} ${unidad}`
  // Con una sola sesión, "viene cargando un rango" miente: fue una vez.
  const vieneCargando =
    h.sessions === 1
      ? t('coach.planEditor.historyLine.didOnce', { range: rango })
      : t('coach.planEditor.historyLine.comesIn', { range: rango })

  return (
    <p className={`${size} text-gray-500 flex items-start gap-1 mt-1 leading-snug`}>
      <History size={11} className="mt-px flex-shrink-0 text-gray-400" />
      <span>
        <strong className="font-medium text-gray-700">{quien}</strong> {vieneCargando}
        {h.max > h.recentMax &&
          t('coach.planEditor.historyLine.max', { value: `${h.max} ${unidad}` })}
        {h.lastDate &&
          t('coach.planEditor.historyLine.lastTime', { date: formatShortDate(h.lastDate) })}
      </span>
    </p>
  )
}
