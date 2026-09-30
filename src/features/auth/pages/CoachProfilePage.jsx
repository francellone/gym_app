import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Globe,
  Lock,
  LogOut,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import AvatarImage from '@/features/avatars/AvatarImage'
import AvatarEditor from '@/features/avatars/AvatarEditor'
import ThemeSelector from '@/components/ThemeSelector'
import { initialsOf } from '@/features/avatars/avatarUrls'
import {
  BIO_MAX,
  CITY_MAX,
  PHONE_MAX,
  WORK_LANGS,
  WORK_MODES,
  directoryMissing,
  isDirectoryIncompleteError,
  formFromProfile,
  payloadFromForm,
  sameAsSaved,
  validateForm,
} from '../coachProfile'

// ============================================================
// Mi perfil — coach (v58, pedido de Franco 2026-09-27)
// Foto, nombre, email (solo lectura), teléfono, idioma de la app,
// idiomas en los que trabaja y una presentación por cada uno,
// contraseña y cerrar sesión.
// ============================================================

export default function CoachProfilePage() {
  const { t } = useTranslation()
  const { profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  // El formulario se inicializa una vez con el perfil; si el perfil cambia
  // por otro lado (refresh), se re-sincroniza con la "versión" guardada.
  const [savedVersion, setSavedVersion] = useState(profile?.updated_at)
  const [form, setForm] = useState(() => formFromProfile(profile))
  if (profile?.updated_at !== savedVersion) {
    setSavedVersion(profile?.updated_at)
    setForm(formFromProfile(profile))
  }

  const [editingPhoto, setEditingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // { kind: 'ok'|'error'|'info', text }
  const [langSaving, setLangSaving] = useState(false)

  const [changingPassword, setChangingPassword] = useState(false)
  const [pw, setPw] = useState({ new: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState(null)

  const dirty = !sameAsSaved(form, profile)

  // Llegada desde "Completar mi perfil" (tarjeta del catálogo): bajar a esa sección.
  useEffect(() => {
    if (window.location.hash === '#catalogo') {
      document.getElementById('catalogo')?.scrollIntoView({ block: 'start' })
    }
  }, [])

  function toggleLanguage(l) {
    setStatus(null)
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l],
    }))
  }

  async function saveForm() {
    const err = validateForm(form)
    if (err) {
      setStatus({ kind: 'error', text: t(`coach.profile.errors.${err}`, { max: BIO_MAX }) })
      return
    }
    if (!dirty) {
      setStatus({ kind: 'info', text: t('coach.profile.noChanges') })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update(payloadFromForm(form))
        .eq('id', profile.id)
        .select('id')
        .single()
      if (error) throw error
      await refreshProfile()
      setStatus({ kind: 'ok', text: t('coach.profile.saved') })
    } catch (e) {
      console.error('[coach profile] save', e)
      setStatus({
        kind: 'error',
        text: isDirectoryIncompleteError(e)
          ? t('coach.profile.errors.directoryIncomplete')
          : t('coach.profile.errors.save'),
      })
    } finally {
      setSaving(false)
    }
  }

  // v69: aparecer o no en el catálogo de coaches (se guarda al tocar).
  const [dirSaving, setDirSaving] = useState(false)
  const [dirError, setDirError] = useState(null)
  const listed = Boolean(profile?.directory_listed)
  const missing = directoryMissing(profile)
  async function toggleDirectory() {
    if (!profile?.id || dirSaving) return
    setDirSaving(true)
    setDirError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ directory_listed: !listed })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
    } catch (e) {
      console.error('[coach profile] directory', e)
      setDirError(
        isDirectoryIncompleteError(e)
          ? t('coach.profile.errors.directoryIncomplete')
          : t('coach.profile.errors.save')
      )
    } finally {
      setDirSaving(false)
    }
  }

  async function changeAppLanguage(lang) {
    if (!profile?.id || lang === (profile?.language || 'es') || langSaving) return
    setLangSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ language: lang })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile() // AuthContext aplica i18n.changeLanguage
    } catch (e) {
      console.error('[coach profile] language', e)
    } finally {
      setLangSaving(false)
    }
  }

  async function changePassword() {
    setPwMsg(null)
    if (pw.new !== pw.confirm) {
      setPwMsg({ kind: 'error', text: t('profile.validation.passwordsMismatch') })
      return
    }
    if (pw.new.length < 6) {
      setPwMsg({ kind: 'error', text: t('profile.validation.passwordTooShort') })
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.new })
      if (error) throw error
      setPw({ new: '', confirm: '' })
      setPwMsg({ kind: 'ok', text: t('profile.passwordUpdated') })
    } catch (e) {
      setPwMsg({ kind: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const appLang = profile?.language || 'es'

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-tinta">{t('coach.profile.title')}</h1>

      {/* Foto + nombre */}
      <div className="card flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEditingPhoto(true)}
          className="relative w-20 h-20 flex-shrink-0"
          aria-label={profile?.avatar_url ? t('profile.photoChange') : t('profile.photoAdd')}
        >
          <span className="w-20 h-20 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden">
            <AvatarImage path={profile?.avatar_url} alt={profile?.name}>
              <span className="text-primary-700 font-bold text-2xl">
                {initialsOf(profile?.name)}
              </span>
            </AvatarImage>
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-primary-700">
            <Camera size={14} />
          </span>
        </button>
        <div className="min-w-0">
          <p className="font-bold text-tinta text-lg break-words">{profile?.name}</p>
          <p className="text-sm text-texto2 break-words">{profile?.email}</p>
        </div>
      </div>
      {editingPhoto && (
        <AvatarEditor
          userId={profile?.id}
          currentPath={profile?.avatar_url}
          privacyText={t('coach.profile.photoPrivacy')}
          onClose={() => setEditingPhoto(false)}
          onSaved={async () => {
            await refreshProfile()
            setEditingPhoto(false)
          }}
        />
      )}

      {/* Datos */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-tinta">{t('coach.profile.personalData')}</h2>

        <div>
          <label className="label" htmlFor="cp-name">
            {t('coach.profile.name')}
          </label>
          <input
            id="cp-name"
            className="input"
            value={form.name}
            placeholder={t('coach.profile.namePlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="label">{t('coach.profile.email')}</label>
          <p className="text-sm text-tinta break-words">{profile?.email}</p>
          <p className="text-[11px] text-texto2 mt-0.5">{t('coach.profile.emailHint')}</p>
        </div>

        <div>
          <label className="label" htmlFor="cp-phone">
            {t('coach.profile.phone')}
          </label>
          <input
            id="cp-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={PHONE_MAX}
            value={form.phone}
            placeholder={t('coach.profile.phonePlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <div>
          <p className="label">{t('coach.profile.workLanguages')}</p>
          <div className="flex gap-2">
            {WORK_LANGS.map((l) => {
              const on = form.languages.includes(l)
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLanguage(l)}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                    on
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(`coach.profile.lang.${l}`)}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-texto2 mt-1.5">{t('coach.profile.workLanguagesHint')}</p>
        </div>

        {WORK_LANGS.filter((l) => form.languages.includes(l)).map((l) => {
          const value = form.bio[l] || ''
          const left = BIO_MAX - value.length
          return (
            <div key={l}>
              <label className="label" htmlFor={`cp-bio-${l}`}>
                {form.languages.length > 1
                  ? t('coach.profile.bioIn', { lang: t(`coach.profile.lang.${l}`).toLowerCase() })
                  : t('coach.profile.bio')}
              </label>
              <textarea
                id={`cp-bio-${l}`}
                lang={l}
                rows={4}
                maxLength={BIO_MAX}
                className="input resize-y"
                value={value}
                placeholder={t('coach.profile.bioPlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, bio: { ...f.bio, [l]: e.target.value } }))}
              />
              <p
                className={`text-[11px] mt-0.5 text-right ${left < 40 ? 'text-amber-600' : 'text-texto2'}`}
              >
                {t('coach.profile.charsLeft', { count: left })}
              </p>
            </div>
          )
        })}

        <div>
          <label className="label" htmlFor="cp-city">
            {t('coach.profile.city')}
          </label>
          <input
            id="cp-city"
            className="input"
            maxLength={CITY_MAX}
            value={form.city}
            placeholder={t('coach.profile.cityPlaceholder')}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>

        <div>
          <p className="label">{t('coach.profile.workMode')}</p>
          <div className="flex gap-2">
            {WORK_MODES.map((m) => {
              const on = form.workMode === m
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm((f) => ({ ...f, workMode: m }))}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                    on
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(`coach.profile.workModes.${m}`)}
                </button>
              )
            })}
          </div>
        </div>

        {status && (
          <p
            className={`text-sm rounded-xl p-3 flex items-center gap-2 ${
              status.kind === 'ok'
                ? 'bg-green-50 text-green-700'
                : status.kind === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-gray-50 text-gray-600'
            }`}
          >
            {status.kind === 'ok' && <CheckCircle2 size={15} />}
            {status.text}
          </p>
        )}

        <button className="btn-primary w-full" onClick={saveForm} disabled={saving}>
          {saving ? t('coach.profile.saving') : t('coach.profile.save')}
        </button>
      </div>

      {/* Catálogo de coaches (v69) */}
      <div className="card space-y-3" id="catalogo">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500" />
          <h2 className="font-semibold text-tinta">{t('coach.profile.directory.title')}</h2>
        </div>
        <p className="text-sm text-texto2">
          {listed ? t('coach.profile.directory.listedText') : t('coach.profile.directory.text')}
        </p>
        {!listed && missing.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">
              {t('coach.profile.directory.missingTitle')}
            </p>
            <ul className="space-y-1">
              {missing.map((m) => (
                <li key={m} className="flex items-center gap-2 text-sm text-gray-600">
                  <Circle size={12} className="text-amber-500" aria-hidden="true" />
                  {t(`coach.profile.directory.missing.${m}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dirError && <p className="text-sm rounded-xl p-3 bg-red-50 text-red-600">{dirError}</p>}
        <button
          type="button"
          className={listed ? 'btn-secondary w-full' : 'btn-primary w-full'}
          onClick={toggleDirectory}
          disabled={dirSaving || (!listed && missing.length > 0)}
        >
          {listed ? t('coach.profile.directory.leave') : t('coach.profile.directory.join')}
        </button>
      </div>

      {/* Idioma de la app */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-900">
            {t('coach.profile.appLanguage')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WORK_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={langSaving}
              aria-pressed={appLang === l}
              onClick={() => changeAppLanguage(l)}
              className={`py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                appLang === l
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } ${langSaving ? 'opacity-60' : ''}`}
            >
              {l === 'es' ? t('common.spanish') : t('common.english')}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">{t('coach.profile.appLanguageHint')}</p>
      </div>

      {/* Apariencia: claro / oscuro (manual §9) */}
      <ThemeSelector />

      {/* Contraseña */}
      <div className="card">
        <button
          onClick={() => setChangingPassword(!changingPassword)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-900">{t('profile.changePassword')}</span>
          </div>
          <ChevronRight
            size={16}
            className={`text-gray-400 transition-transform ${changingPassword ? 'rotate-90' : ''}`}
          />
        </button>
        {changingPassword && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div>
              <label className="label text-xs">{t('profile.newPassword')}</label>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.new}
                onChange={(e) => setPw((p) => ({ ...p, new: e.target.value }))}
                placeholder={t('profile.min6CharsPlaceholder')}
              />
            </div>
            <div>
              <label className="label text-xs">{t('profile.confirmPassword')}</label>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                placeholder={t('profile.repeatPasswordPlaceholder')}
              />
            </div>
            {pwMsg && (
              <p className={`text-xs ${pwMsg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {pwMsg.text}
              </p>
            )}
            <button
              onClick={changePassword}
              disabled={saving}
              className="btn-primary w-full text-sm"
            >
              {t('profile.updatePassword')}
            </button>
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        className="btn-secondary w-full flex items-center justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
      >
        <LogOut size={16} />
        {t('coach.layout.signOut')}
      </button>
    </div>
  )
}
