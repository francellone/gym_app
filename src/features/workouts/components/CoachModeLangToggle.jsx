// Selector ES/EN de la pantalla de registro en modo coach.
// Devuelve null fuera del modo coach (la ruta de la alumna no monta el
// provider), así el mismo header sirve para las dos rutas.
// Diseño y por qué no es el idioma global: ver CoachModeLanguage.jsx.
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { useCoachModeLanguage } from '../coachModeLanguageContext'

const OPTIONS = [
  { code: 'es', labelKey: 'common.spanish' },
  { code: 'en', labelKey: 'common.english' },
]

export default function CoachModeLangToggle() {
  const ctx = useCoachModeLanguage()
  const { t } = useTranslation()
  if (!ctx) return null

  return (
    <div className="flex items-center justify-end gap-1.5 mb-1.5">
      <Languages size={13} className="text-white/70 flex-shrink-0" aria-hidden="true" />
      <span className="sr-only" id="coach-mode-lang-label">
        {t('workout.coachModeLangLabel')}
      </span>
      <div
        role="group"
        aria-labelledby="coach-mode-lang-label"
        className="flex items-center rounded-lg bg-white/20 p-0.5"
      >
        {OPTIONS.map(({ code, labelKey }) => {
          const active = ctx.lang === code
          return (
            <button
              key={code}
              type="button"
              onClick={() => ctx.setLang(code)}
              aria-pressed={active}
              title={t(labelKey)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors ${
                active ? 'bg-white text-primary-700' : 'text-white/80 hover:text-white'
              }`}
            >
              {code.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
