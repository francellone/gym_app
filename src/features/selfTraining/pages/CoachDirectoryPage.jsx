// ============================================================
// Buscar coach — catálogo de coaches (v69)
// ------------------------------------------------------------
// Para la persona que entrena sin coach. Muestra las coaches que eligieron
// aparecer (con foto, ciudad, modalidad, idiomas y presentación). El único
// contacto es "Pedir sumarme": el mismo pedido que el link de invitación,
// con la decisión de si la coach ve lo entrenado antes.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, MapPin, Globe2, Monitor, Search, Clock } from 'lucide-react'
import AvatarImage from '@/features/avatars/AvatarImage'
import { initialsOf } from '@/features/avatars/avatarUrls'
import {
  bioFor,
  cancelCoachRequest,
  fetchCoachDirectory,
  fetchMyPendingCoachRequest,
  filterCoaches,
  requestListedCoach,
} from '../coachDirectory'

export default function CoachDirectoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [coaches, setCoaches] = useState([])
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ city: '', workMode: '', language: '' })
  const [asking, setAsking] = useState(null) // coach al que se le está pidiendo

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, req] = await Promise.all([fetchCoachDirectory(), fetchMyPendingCoachRequest()])
      setCoaches(list)
      setPending(req)
    } catch (e) {
      console.error('[CoachDirectoryPage]', e)
      setError(t('selfTraining.directory.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const visible = filterCoaches(coaches, filters)
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  async function cancel() {
    try {
      await cancelCoachRequest()
      await load()
    } catch (e) {
      console.error('[CoachDirectoryPage] cancel', e)
      setError(t('selfTraining.directory.cancelError'))
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-ghost p-2"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            {t('selfTraining.directory.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('selfTraining.directory.subtitle')}</p>
        </div>
      </div>

      {pending && (
        <div className="card bg-primary-50 border-primary-200 flex items-start gap-3">
          <Clock size={18} className="text-primary-600 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-tinta">
              {t('selfTraining.directory.pending', { coach: pending.coach_name })}
            </p>
            <button
              type="button"
              onClick={cancel}
              className="text-sm text-primary-700 font-medium mt-1"
            >
              {t('selfTraining.directory.cancelRequest')}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            className="input pl-9"
            aria-label={t('selfTraining.directory.cityFilter')}
            placeholder={t('selfTraining.directory.cityFilter')}
            value={filters.city}
            onChange={(e) => setFilter('city', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="input"
            aria-label={t('selfTraining.directory.modeFilter')}
            value={filters.workMode}
            onChange={(e) => setFilter('workMode', e.target.value)}
          >
            <option value="">{t('selfTraining.directory.anyMode')}</option>
            <option value="online">{t('coach.profile.workModes.online')}</option>
            <option value="in_person">{t('coach.profile.workModes.in_person')}</option>
          </select>
          <select
            className="input"
            aria-label={t('selfTraining.directory.languageFilter')}
            value={filters.language}
            onChange={(e) => setFilter('language', e.target.value)}
          >
            <option value="">{t('selfTraining.directory.anyLanguage')}</option>
            <option value="es">{t('coach.profile.lang.es')}</option>
            <option value="en">{t('coach.profile.lang.en')}</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm rounded-xl p-3 bg-red-50 text-red-600">{error}</p>}

      {loading ? (
        <div className="card flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          {coaches.length === 0
            ? t('selfTraining.directory.emptyAll')
            : t('selfTraining.directory.emptyFiltered')}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              disabled={Boolean(pending)}
              isPending={pending?.coach_id === coach.id}
              asking={asking?.id === coach.id}
              onAsk={() => setAsking(coach)}
              onCancelAsk={() => setAsking(null)}
              onSent={async () => {
                setAsking(null)
                await load()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CoachCard({ coach, disabled, isPending, asking, onAsk, onCancelAsk, onSent }) {
  const { t, i18n } = useTranslation()
  const bio = bioFor(coach, i18n.language)
  const firstName = (coach.name || '').trim().split(/\s+/)[0]
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
          <AvatarImage path={coach.avatar_url} alt={coach.name}>
            <span className="text-primary-700 font-bold text-lg">{initialsOf(coach.name)}</span>
          </AvatarImage>
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-tinta break-words">{coach.name}</p>
          <p className="text-xs text-texto2 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              {coach.coach_city}
            </span>
            <span className="inline-flex items-center gap-1">
              <Monitor size={12} aria-hidden="true" />
              {t(`coach.profile.workModes.${coach.coach_work_mode}`)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe2 size={12} aria-hidden="true" />
              {(coach.coach_languages || []).map((l) => t(`coach.profile.lang.${l}`)).join(' · ')}
            </span>
          </p>
        </div>
      </div>
      {bio && <p className="text-sm text-tinta whitespace-pre-line">{bio}</p>}

      {isPending ? (
        <p className="text-sm text-primary-700 font-medium">
          {t('selfTraining.directory.requested')}
        </p>
      ) : asking ? (
        <AskForm coachId={coach.id} coachName={firstName} onCancel={onCancelAsk} onSent={onSent} />
      ) : (
        <button
          type="button"
          onClick={onAsk}
          disabled={disabled}
          className="btn-primary w-full disabled:opacity-50"
        >
          {t('selfTraining.directory.ask')}
        </button>
      )}
    </div>
  )
}

function AskForm({ coachId, coachName, onCancel, onSent }) {
  const { t } = useTranslation()
  const [share, setShare] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (share === null) return
    setSending(true)
    setError(null)
    try {
      await requestListedCoach(coachId, share)
      await onSent()
    } catch (err) {
      console.error('[CoachDirectoryPage] ask', err)
      setError(t('selfTraining.directory.askError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-linea pt-3">
      <p className="text-xs text-texto2">{t('auth.joinHint', { coach: coachName })}</p>
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
              name={`share-${coachId}`}
              checked={share === o.value}
              onChange={() => setShare(o.value)}
            />
            <span className="text-sm text-tinta">{t(o.label)}</span>
          </label>
        ))}
        <p className="text-xs text-texto2">{t('auth.joinShareFinal')}</p>
      </fieldset>
      {error && <p className="text-sm rounded-xl p-3 bg-red-50 text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={sending || share === null}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {sending ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('auth.joinSubmit')}
        </button>
      </div>
    </form>
  )
}
