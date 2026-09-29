import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import AuthShell, { AuthError, AuthNotice } from '../components/AuthShell'
import { appUrl, authErrorKey } from '../authLinks'

// "Olvidé mi contraseña": Supabase manda un link a /reset-password.
// El mensaje de éxito es el mismo exista o no la cuenta (no revela mails).
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: e2 } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: appUrl(window.location.origin, '/reset-password'),
      })
      if (e2) throw e2
      setSent(true)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      footer={
        <Link to="/login" className="font-semibold text-primary-700 hover:underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <AuthNotice>{t('auth.forgotSent')}</AuthNotice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-texto2">{t('auth.forgotHint')}</p>
          <div>
            <label htmlFor="forgot-email" className="label">
              {t('loginPage.email')}
            </label>
            <input
              id="forgot-email"
              type="email"
              className="input"
              placeholder={t('loginPage.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <AuthError>{error}</AuthError>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '…' : t('auth.forgotSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
