// ============================================================
// Acciones de la persona que entrena sin coach (v68)
// ------------------------------------------------------------
// Dos puertas: registrar lo que hizo hoy (registro libre) y armar o
// editar su plan. Se muestra en el Inicio y en "Hoy" cuando no hay plan.
// ============================================================
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, PencilLine, PenSquare, Users } from 'lucide-react'

export default function SelfTrainingActions({ ownPlanId = null, compact = false }) {
  const { t } = useTranslation()
  return (
    <div className={compact ? 'space-y-2' : 'card p-5 space-y-3'}>
      {!compact && (
        <div>
          <p className="eyebrow">{t('selfTraining.actions.eyebrow')}</p>
          <p className="text-sm text-gray-500 mt-1">
            {ownPlanId ? t('selfTraining.actions.withPlan') : t('selfTraining.actions.noPlan')}
          </p>
        </div>
      )}
      <Link
        to="/student/libre"
        className="btn-primary w-full flex items-center justify-center gap-2 text-base"
      >
        <PencilLine size={18} aria-hidden="true" />
        {t('selfTraining.actions.logToday')}
      </Link>
      <Link
        to={ownPlanId ? `/student/plan/${ownPlanId}/editar` : '/student/plan/nuevo'}
        className="btn-secondary w-full flex items-center justify-center gap-2 text-base"
      >
        {ownPlanId ? (
          <PenSquare size={18} aria-hidden="true" />
        ) : (
          <ClipboardList size={18} aria-hidden="true" />
        )}
        {ownPlanId ? t('selfTraining.actions.editPlan') : t('selfTraining.actions.buildPlan')}
      </Link>
      <Link
        to="/student/coaches"
        className="w-full flex items-center justify-center gap-2 text-sm text-primary-700 font-medium py-2"
      >
        <Users size={16} aria-hidden="true" />
        {t('selfTraining.actions.findCoach')}
      </Link>
    </div>
  )
}
