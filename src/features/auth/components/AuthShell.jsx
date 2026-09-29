import { useTranslation } from 'react-i18next'
import { Dumbbell } from 'lucide-react'
import { setPreLoginLanguage } from '@/i18n'

// Toggle de idioma pre-login. Guarda la preferencia en localStorage; al
// loguearse, profiles.language pisa esta elección (ver AuthContext).
function LanguageToggle({ current }) {
  const langs = ['es', 'en']
  return (
    <div className="flex justify-center gap-1 mb-6">
      {langs.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setPreLoginLanguage(lng)}
          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase transition-colors ${
            current === lng
              ? 'bg-white text-primary-700'
              : 'text-texto2 hover:text-tinta hover:bg-white/60'
          }`}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}

// Marco común de las pantallas sin sesión (ingresar, crear cuenta, recuperar
// contraseña, alta): fondo, idioma, logo y la tarjeta blanca.
export default function AuthShell({ title, showLanguage = true, children, footer }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="min-h-screen bg-durazno-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {showLanguage && <LanguageToggle current={i18n.language?.startsWith('en') ? 'en' : 'es'} />}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Dumbbell className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-tinta">GymCoach</h1>
          <p className="text-texto2 mt-1">{title || t('loginPage.tagline')}</p>
        </div>

        <div className="bg-white rounded-tarjeta border border-linea shadow-flotante p-6">
          {children}
        </div>

        {footer && <div className="text-center text-sm mt-6 space-y-2">{footer}</div>}
      </div>
    </div>
  )
}

export function AuthError({ children }) {
  if (!children) return null
  return (
    <div role="alert" className="text-red-600 bg-red-50 rounded-xl p-3 text-sm">
      {children}
    </div>
  )
}

export function AuthNotice({ children }) {
  if (!children) return null
  return <div className="text-primary-800 bg-primary-50 rounded-xl p-3 text-sm">{children}</div>
}
