import { Monitor, Sun, Moon, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/useTheme'

// Selector de tema (manual §9): Sistema / Claro / Oscuro.
// Se guarda en el dispositivo; vale para la persona y para la coach.
const OPTIONS = [
  { mode: 'system', icon: Monitor },
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
]

export default function ThemeSelector() {
  const { t } = useTranslation()
  const [mode, setMode] = useTheme()
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Palette size={16} className="text-texto2" />
        <span className="text-sm font-medium text-tinta">{t('profile.theme.title')}</span>
      </div>
      <div
        className="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={t('profile.theme.title')}
      >
        {OPTIONS.map(({ mode: m, icon: Icon }) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-1 text-sm py-2.5 rounded-xl border font-medium transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              {t(`profile.theme.${m}`)}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-texto3 mt-2">{t('profile.theme.hint')}</p>
    </div>
  )
}
