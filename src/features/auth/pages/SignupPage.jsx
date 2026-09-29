import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import AuthShell, { AuthError, AuthNotice } from '../components/AuthShell'
import {
  appUrl,
  authErrorKey,
  normalizeInviteCode,
  readPendingInvite,
  savePendingInvite,
  validatePasswords,
} from '../authLinks'

// Crear cuenta propia (v65). El perfil NO se crea acá: recién después de
// confirmar el mail, en /onboarding, donde se elige persona / coach / ambas.
// Si vino por el link de una coach, el código queda guardado para mandarle
// el pedido al terminar el alta.
export default function SignupPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const inviteCode = normalizeInviteCode(params.get('invite')) || readPendingInvite()
  const [coachName, setCoachName] = useState(null)
  const [inviteInvalid, setInviteInvalid] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sentTo, setSentTo] = useState(null)

  useEffect(() => {
    if (!inviteCode) return
    let cancelled = false
    supabase.rpc('resolve_invite_code', { p_code: inviteCode }).then(({ data, error: e }) => {
      if (cancelled) return
      if (e || !data) setInviteInvalid(true)
      else {
        setCoachName(data)
        savePendingInvite(inviteCode)
      }
    })
    return () => {
      cancelled = true
    }
  }, [inviteCode])

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
      const { error: e2 } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appUrl(window.location.origin, '/login') },
      })
      if (e2) throw e2
      // Supabase no dice si el mail ya existía (para no revelar cuentas):
      // el mensaje es el mismo en los dos casos.
      setSentTo(email.trim())
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  const footer = (
    <Link to="/login" className="font-semibold text-primary-700 hover:underline">
      {t('auth.haveAccount')}
    </Link>
  )

  if (sentTo) {
    return (
      <AuthShell title={t('auth.checkEmailTitle')} footer={footer}>
        <p className="text-sm text-tinta">{t('auth.checkEmailBody', { email: sentTo })}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.signupTitle')} footer={footer}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {coachName && <AuthNotice>{t('auth.joiningCoach', { coach: coachName })}</AuthNotice>}
        {inviteInvalid && <AuthNotice>{t('auth.inviteInvalid')}</AuthNotice>}

        <div>
          <label htmlFor="signup-email" className="label">
            {t('loginPage.email')}
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="label">
            {t('auth.passwordNew')}
          </label>
          <input
            id="signup-password"
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
          <label htmlFor="signup-repeat" className="label">
            {t('auth.passwordRepeat')}
          </label>
          <input
            id="signup-repeat"
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
          {loading ? '…' : t('auth.signupSubmit')}
        </button>
      </form>
    </AuthShell>
  )
}
