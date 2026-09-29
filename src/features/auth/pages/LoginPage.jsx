import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../AuthContext'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import AuthShell from '../components/AuthShell'

export default function LoginPage() {
  const { signIn } = useAuth()
  const { t } = useTranslation()
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
    <AuthShell
      footer={
        <>
          <p>
            <Link to="/signup" className="font-semibold text-primary-700 hover:underline">
              {t('auth.noAccountSignup')}
            </Link>
          </p>
          <p className="text-texto2 text-xs">{t('loginPage.noAccount')}</p>
        </>
      }
    >
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
      <p className="text-center mt-4">
        <Link
          to="/forgot-password"
          className="text-sm text-texto2 hover:text-tinta hover:underline"
        >
          {t('auth.forgotPassword')}
        </Link>
      </p>
    </AuthShell>
  )
}
