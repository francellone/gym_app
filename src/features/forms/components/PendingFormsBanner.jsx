/**
 * PendingFormsBanner
 *
 * Cartel de formularios pendientes del alumno. Vive en StudentLayout, así
 * que se ve en TODAS las pantallas del alumno (Inicio, Entrenar, Notas,
 * Progreso, Historial, Perfil) y no solo en el Inicio.
 *
 * Antes vivía dentro de StudentDashboard: si el alumno entraba directo a
 * otra pestaña —o si el fetch tardaba más que su paciencia— el formulario
 * asignado no tenía ningún otro camino (no hay item de menú ni notificación
 * al enviarlo). Ver [[usePendingForms]].
 *
 * Prioridad: si hay intake pendiente se muestra solo ese (es bloqueante).
 */

import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { usePendingForms, formPathFor } from '@/features/forms/hooks/usePendingForms'

export default function PendingFormsBanner({ studentId }) {
  const { t } = useTranslation()
  const { intake, followUps } = usePendingForms(studentId)

  if (intake) {
    return (
      <Banner
        to="/student/intake"
        emoji="📋"
        tone="amber"
        title={t('dashboard.intakePendingTitle')}
        body={t('dashboard.intakePendingBody')}
      />
    )
  }

  if (followUps.length === 0) return null

  return (
    <Banner
      to={followUps.length === 1 ? formPathFor(followUps[0]) : '/student/forms'}
      emoji="📝"
      tone="purple"
      title={t('dashboard.followUpPendingTitle', { count: followUps.length })}
      body={t('dashboard.followUpPendingBody', { count: followUps.length })}
    />
  )
}

const TONES = {
  amber: {
    box: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    title: 'text-amber-800',
    body: 'text-amber-600',
    chevron: 'text-amber-400',
  },
  purple: {
    box: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    title: 'text-purple-800',
    body: 'text-purple-600',
    chevron: 'text-purple-400',
  },
}

function Banner({ to, emoji, tone, title, body }) {
  const c = TONES[tone]
  return (
    <div className="max-w-lg mx-auto">
      <Link
        to={to}
        className={`block mx-4 mt-4 border rounded-2xl px-4 py-3 transition-colors ${c.box}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${c.title}`}>{title}</p>
            <p className={`text-xs ${c.body}`}>{body}</p>
          </div>
          <ChevronRight size={18} className={`flex-shrink-0 ${c.chevron}`} />
        </div>
      </Link>
    </div>
  )
}
