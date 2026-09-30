import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'

// v69: invita a la coach a aparecer en el catálogo de coaches y a completar
// su perfil. Se puede cerrar ("Ahora no"); queda recordado en este navegador.
const DISMISS_KEY = 'gymcoach_directory_suggestion_dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function DirectorySuggestionCard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!profile || profile.role !== 'coach' || profile.directory_listed || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage bloqueado: se oculta solo en esta visita
    }
    setDismissed(true)
  }

  return (
    <div className="card flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
        <Users size={18} className="text-primary-600" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-tinta text-sm">{t('coach.students.directory.title')}</p>
        <p className="text-xs text-texto2 mt-0.5">{t('coach.students.directory.text')}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link to="/coach/profile#catalogo" className="btn-primary text-sm px-3 py-1.5">
            {t('coach.students.directory.cta')}
          </Link>
          <button type="button" onClick={dismiss} className="btn-secondary text-sm px-3 py-1.5">
            {t('coach.students.directory.later')}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="btn-ghost p-1 text-gray-400"
        aria-label={t('common.close')}
      >
        <X size={16} />
      </button>
    </div>
  )
}
