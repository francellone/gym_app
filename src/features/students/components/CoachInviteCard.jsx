import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Copy, Check, MessageCircle, RefreshCw } from 'lucide-react'
import { inviteLink } from '@/features/auth/authLinks'
import { whatsappShareUrl } from '../lib/welcomeMessage'
import { fetchMyInviteCode, regenerateInviteCode } from '../linkRequestsApi'

// Link de invitación de la coach (v65). Quien entra por acá crea su cuenta y
// le llega un pedido que la coach acepta o rechaza. Renovarlo invalida el
// anterior (por si circuló más de lo previsto).
export default function CoachInviteCard() {
  const { t } = useTranslation()
  const [code, setCode] = useState(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRenew, setConfirmRenew] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyInviteCode()
      .then((c) => !cancelled && setCode(c))
      .catch((e) => {
        console.error('[CoachInviteCard]', e)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const link = code ? inviteLink(window.location.origin, code) : ''
  const message = code ? t('coach.students.invite.shareMessage', { link }) : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* el link queda visible para copiarlo a mano */
    }
  }

  async function renew() {
    setBusy(true)
    try {
      setCode(await regenerateInviteCode())
      setConfirmRenew(false)
    } catch (e) {
      console.error('[CoachInviteCard] renew', e)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (error && !code) return null

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-durazno-100 rounded-lg flex items-center justify-center shrink-0">
          <Link2 size={18} className="text-primary-700" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">{t('coach.students.invite.title')}</h2>
          <p className="text-sm text-gray-500">{t('coach.students.invite.hint')}</p>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-mono break-all">
        {code ? link : t('common.loading')}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!code}
          className="btn-primary flex items-center gap-2"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t('coach.students.welcome.copied') : t('coach.students.invite.copy')}
        </button>
        {code && (
          <a
            href={whatsappShareUrl(message)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <MessageCircle size={16} />
            {t('coach.students.welcome.whatsapp')}
          </a>
        )}
        {!confirmRenew ? (
          <button
            type="button"
            onClick={() => setConfirmRenew(true)}
            disabled={!code}
            className="btn-ghost flex items-center gap-2"
          >
            <RefreshCw size={16} />
            {t('coach.students.invite.renew')}
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-sm text-amber-700">
            {t('coach.students.invite.renewConfirm')}
            <button type="button" onClick={renew} disabled={busy} className="btn-secondary">
              {t('coach.students.invite.renewYes')}
            </button>
            <button type="button" onClick={() => setConfirmRenew(false)} className="btn-ghost">
              {t('common.cancel')}
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
