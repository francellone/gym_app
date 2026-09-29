import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../AuthContext'
import AuthShell, { AuthError, AuthNotice } from '../components/AuthShell'
import {
  authErrorKey,
  clearPendingInvite,
  homePathFor,
  readPendingInvite,
  signupChoiceToParams,
} from '../authLinks'

const CHOICES = [
  { id: 'train', title: 'auth.choiceTrain', hint: 'auth.choiceTrainHint' },
  { id: 'coach', title: 'auth.choiceCoach', hint: 'auth.choiceCoachHint' },
  { id: 'both', title: 'auth.choiceBoth', hint: 'auth.choiceBothHint' },
]

// Alta del perfil propio (v65, complete_signup): se llega acá con el mail ya
// confirmado y sesión abierta, pero sin fila en profiles. Si la persona vino
// por el link de una coach, al terminar se manda el pedido de vínculo. Una
// cuenta recién creada no tiene historial, así que se comparte "todo".
export default function OnboardingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { refreshProfile, signOut } = useAuth()
  const invite = readPendingInvite()

  const [name, setName] = useState('')
  const [language, setLanguage] = useState(i18n.language?.startsWith('en') ? 'en' : 'es')
  const [choice, setChoice] = useState('train')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function changeLanguage(lng) {
    setLanguage(lng)
    i18n.changeLanguage(lng)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { asCoach, alsoTrains } = signupChoiceToParams(choice)
    try {
      const { data: profile, error: e1 } = await supabase.rpc('complete_signup', {
        p_name: name.trim(),
        p_language: language,
        p_as_coach: asCoach,
        p_also_trains: alsoTrains,
      })
      if (e1) throw e1

      if (invite && !asCoach) {
        // Si el pedido falla (link cambiado), la cuenta igual quedó creada:
        // se puede sumar después con un link nuevo.
        const { error: e2 } = await supabase.rpc('request_coach_link', {
          p_code: invite,
          p_share_history: true,
        })
        if (e2) console.warn('[onboarding] pedido de vínculo', e2)
      }
      clearPendingInvite()
      await refreshProfile()
      navigate(homePathFor(profile, false), { replace: true })
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.onboardingTitle')}
      showLanguage={false}
      footer={
        <button type="button" onClick={signOut} className="text-texto2 hover:underline">
          {t('auth.signOutOther')}
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-texto2">{t('auth.onboardingHint')}</p>

        <div>
          <label htmlFor="onb-name" className="label">
            {t('auth.name')}
          </label>
          <input
            id="onb-name"
            className="input"
            placeholder={t('auth.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="onb-lang" className="label">
            {t('auth.language')}
          </label>
          <select
            id="onb-lang"
            className="input"
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="es">{t('common.spanish')}</option>
            <option value="en">{t('common.english')}</option>
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">{t('auth.choiceQuestion')}</legend>
          {CHOICES.map((c) => (
            <label
              key={c.id}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                choice === c.id ? 'border-primary-500 bg-primary-50' : 'border-linea'
              }`}
            >
              <input
                type="radio"
                name="onb-choice"
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-tinta">{t(c.title)}</span>
                <span className="block text-xs text-texto2">{t(c.hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {invite && choice !== 'train' && <AuthNotice>{t('auth.coachInviteIgnored')}</AuthNotice>}
        <AuthError>{error}</AuthError>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? '…' : t('auth.onboardingSubmit')}
        </button>
      </form>
    </AuthShell>
  )
}
