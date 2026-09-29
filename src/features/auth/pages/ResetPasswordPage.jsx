import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../AuthContext'
import AuthShell, { AuthError, AuthNotice } from '../components/AuthShell'
import { authErrorKey, validatePasswords } from '../authLinks'

// Destino del link de "olvidé mi contraseña". Supabase lee el token del link
// y abre una sesión de recuperación; acá solo se elige la contraseña nueva.
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const pwError = validatePasswords(password, repeat)
    if (pwError) {
      setError(t(pwError))
      return
    }
    setLoading(true)
    try {
      const { error: e2 } = await supabase.auth.updateUser({ password })
      if (e2) throw e2
      setDone(true)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  const footer = (
    <Link to="/forgot-password" className="font-semibold text-primary-700 hover:underline">
      {t('auth.forgotSubmit')}
    </Link>
  )

  if (done) {
    return (
      <AuthShell title={t('auth.resetTitle')} showLanguage={false}>
        <AuthNotice>{t('auth.resetDone')}</AuthNotice>
        <button type="button" onClick={() => navigate('/')} className="btn-primary w-full mt-4">
          {t('auth.goHome')}
        </button>
      </AuthShell>
    )
  }

  if (!authLoading && !user) {
    return (
      <AuthShell title={t('auth.resetTitle')} footer={footer}>
        <AuthError>{t('auth.resetNoSession')}</AuthError>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.resetTitle')} showLanguage={false}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="label">
            {t('auth.passwordNew')}
          </label>
          <input
            id="reset-password"
            type="password"
            className="input"
            placeholder={t('auth.passwordMin')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="reset-repeat" className="label">
            {t('auth.passwordRepeat')}
          </label>
          <input
            id="reset-repeat"
            type="password"
            className="input"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? '…' : t('auth.resetSubmit')}
        </button>
      </form>
    </AuthShell>
  )
}
