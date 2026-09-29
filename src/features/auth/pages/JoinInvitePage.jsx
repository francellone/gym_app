import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../AuthContext'
import AuthShell, { AuthError, AuthNotice } from '../components/AuthShell'
import {
  authErrorKey,
  clearPendingInvite,
  homePathFor,
  normalizeInviteCode,
  savePendingInvite,
} from '../authLinks'

// /unirme/:code — el link que comparte la coach.
//   * sin sesión        → se guarda el código y va a crear cuenta
//   * sesión sin perfil → se guarda y va al alta
//   * persona sin coach → elige si comparte lo anterior y manda el pedido
//   * coach o persona que ya tiene coach → se le explica por qué no aplica
export default function JoinInvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code: rawCode } = useParams()
  const code = normalizeInviteCode(rawCode)
  const { user, profile, profileMissing, loading } = useAuth()

  const [coachName, setCoachName] = useState(null)
  const [invalid, setInvalid] = useState(!code)
  const [share, setShare] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!code) return
    let cancelled = false
    supabase.rpc('resolve_invite_code', { p_code: code }).then(({ data, error: e }) => {
      if (cancelled) return
      if (e || !data) setInvalid(true)
      else setCoachName(data)
    })
    return () => {
      cancelled = true
    }
  }, [code])

  // Idempotente: guardar el código antes de mandar a crear cuenta o al alta,
  // que pueden terminar otro día (después de confirmar el mail).
  if (code && !invalid && (!user || profileMissing)) savePendingInvite(code)

  if (loading) return null
  if (!invalid && !user) return <Navigate to={`/signup?invite=${code}`} replace />
  if (!invalid && user && profileMissing) return <Navigate to="/onboarding" replace />

  const home = homePathFor(profile, profileMissing)
  const goHome = (
    <button type="button" onClick={() => navigate(home)} className="btn-primary w-full mt-4">
      {t('auth.goHome')}
    </button>
  )

  if (invalid) {
    return (
      <AuthShell
        footer={
          <Link to="/signup" className="font-semibold text-primary-700 hover:underline">
            {t('auth.createAccount')}
          </Link>
        }
      >
        <AuthNotice>{t('auth.inviteInvalid')}</AuthNotice>
      </AuthShell>
    )
  }

  if (!coachName) return null

  if (profile?.role === 'coach') {
    return (
      <AuthShell title={t('auth.joinTitle', { coach: coachName })} showLanguage={false}>
        <AuthNotice>{t('auth.joinOnlyPeople')}</AuthNotice>
        {goHome}
      </AuthShell>
    )
  }
  if (profile?.coach_id) {
    return (
      <AuthShell title={t('auth.joinTitle', { coach: coachName })} showLanguage={false}>
        <AuthNotice>{t('auth.joinAlreadyHasCoach')}</AuthNotice>
        {goHome}
      </AuthShell>
    )
  }
  if (sent) {
    return (
      <AuthShell title={t('auth.joinTitle', { coach: coachName })} showLanguage={false}>
        <AuthNotice>{t('auth.joinSent', { coach: coachName })}</AuthNotice>
        {goHome}
      </AuthShell>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (share === null) return
    setError(null)
    setSending(true)
    try {
      const { error: e2 } = await supabase.rpc('request_coach_link', {
        p_code: code,
        p_share_history: share,
      })
      if (e2) throw e2
      clearPendingInvite()
      setSent(true)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell title={t('auth.joinTitle', { coach: coachName })} showLanguage={false}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-texto2">{t('auth.joinHint', { coach: coachName })}</p>
        <fieldset className="space-y-2">
          <legend className="label">{t('auth.joinShareQuestion', { coach: coachName })}</legend>
          {[
            { value: true, label: 'auth.joinShareYes' },
            { value: false, label: 'auth.joinShareNo' },
          ].map((o) => (
            <label
              key={String(o.value)}
              className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${
                share === o.value ? 'border-primary-500 bg-primary-50' : 'border-linea'
              }`}
            >
              <input
                type="radio"
                name="join-share"
                checked={share === o.value}
                onChange={() => setShare(o.value)}
              />
              <span className="text-sm text-tinta">{t(o.label)}</span>
            </label>
          ))}
          <p className="text-xs text-texto2">{t('auth.joinShareFinal')}</p>
        </fieldset>
        <AuthError>{error}</AuthError>
        <button type="submit" disabled={sending || share === null} className="btn-primary w-full">
          {sending ? '…' : t('auth.joinSubmit')}
        </button>
      </form>
    </AuthShell>
  )
}
