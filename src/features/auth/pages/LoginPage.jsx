import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../AuthContext'
import { setPreLoginLanguage } from '@/i18n'
import { Dumbbell, Eye, EyeOff, AlertCircle } from 'lucide-react'

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
              : 'text-primary-200 hover:text-white hover:bg-white/10'
          }`}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const { t, i18n } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch {
      setError(t('loginPage.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <LanguageToggle current={i18n.language?.startsWith('en') ? 'en' : 'es'} />

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <Dumbbell className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-white">GymCoach</h1>
          <p className="text-primary-200 mt-1">{t('loginPage.tagline')}</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="label">
                {t('loginPage.email')}
              </label>
              <input
                id="login-email"
                type="email"
                className="input"
                placeholder={t('loginPage.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="label">
                {t('loginPage.password')}
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                t('loginPage.signIn')
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-200 text-xs mt-6">{t('loginPage.noAccount')}</p>
      </div>
    </div>
  )
}
