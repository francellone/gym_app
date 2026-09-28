import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/useTheme'

// Botón a mano para pasar de claro a oscuro (barra de arriba, al lado de la
// campana). Fija el tema contrario al que se ve; "Automático" se elige en Perfil.
export default function ThemeToggleButton({ className = '' }) {
  const { t } = useTranslation()
  const [, setMode, resolved] = useTheme()
  const dark = resolved === 'dark'
  const label = dark ? t('profile.theme.toLight') : t('profile.theme.toDark')
  return (
    <button
      type="button"
      onClick={() => setMode(dark ? 'light' : 'dark')}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg text-texto2 hover:bg-durazno-50 transition-colors ${className}`}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}
