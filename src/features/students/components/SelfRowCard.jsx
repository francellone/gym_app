import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { hasBothViews } from '@/features/auth/viewMode'
import AvatarImage from '@/features/avatars/AvatarImage'
import { initialsOf } from '@/features/avatars/avatarUrls'

// v71 — "Yo" arriba de la lista de personas, para la coach que también
// entrena: abre su ficha como la de cualquier persona (planes, progreso,
// historial) y desde ahí se asigna sus propias plantillas.
export default function SelfRowCard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  if (!hasBothViews(profile)) return null
  return (
    <Link
      to={`/coach/students/${profile.id}?tab=plans`}
      className="card flex items-center gap-3 border-primary-200 hover:bg-durazno-50/60 transition-colors"
    >
      <span className="w-10 h-10 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
        <AvatarImage path={profile.avatar_url} alt={profile.name}>
          <span className="text-primary-700 font-bold text-sm">{initialsOf(profile.name)}</span>
        </AvatarImage>
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-tinta">{t('coach.students.self.title')}</p>
        <p className="text-xs text-texto2">{t('coach.students.self.hint')}</p>
      </div>
      <ChevronRight size={16} className="text-texto3" aria-hidden="true" />
    </Link>
  )
}
