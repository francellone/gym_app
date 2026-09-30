import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { hasBothViews, savePreferredView } from '../viewMode'

// v71 — "Ambas": botón para pasar del panel de coach a "Mi entrenamiento" y
// al revés. Solo aparece si la coach marcó que también entrena. La elección
// se recuerda en este dispositivo (homePathFor la usa al entrar).
export default function ViewSwitchButton({ to, className = '' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const navigate = useNavigate()
  if (!hasBothViews(profile)) return null

  const label = to === 'student' ? t('viewSwitch.toTraining') : t('viewSwitch.toCoach')
  return (
    <button
      type="button"
      onClick={() => {
        savePreferredView(to)
        navigate(to === 'student' ? '/student' : '/coach')
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors ${className}`}
    >
      <ArrowLeftRight size={13} aria-hidden="true" />
      {label}
    </button>
  )
}
