import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, X } from 'lucide-react'
import { enablePush, getPushStatus } from '../services/pushService'

// Cartel de una sola vez que ofrece activar los avisos en este dispositivo
// (v81). Solo aparece si el dispositivo puede recibirlos y todavía no se
// decidió nada. Después, la tarjeta de Mi perfil es el lugar para cambiarlo.

const DISMISS_KEY = 'gymcoach-push-prompt-dismissed'

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function PushPromptBanner({ userId, offsetClass = 'bottom-4' }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId || wasDismissed()) return
    let alive = true
    getPushStatus().then((s) => alive && setVisible(s === 'off'))
    return () => {
      alive = false
    }
  }, [userId])

  if (!visible) return null

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* no-op */
    }
    setVisible(false)
  }

  async function handleEnable() {
    setBusy(true)
    try {
      await enablePush(userId)
    } catch {
      /* si falla, queda la tarjeta de Mi perfil para reintentar */
    }
    close()
  }

  return (
    <div
      className={`fixed ${offsetClass} inset-x-3 z-50 max-w-md mx-auto
                  bg-white border border-gray-200 shadow-lg rounded-2xl
                  px-4 py-3 flex items-start gap-3`}
      role="status"
    >
      <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <BellRing size={18} className="text-primary-600" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{t('notifications.push.bannerTitle')}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          {t('notifications.push.bannerBody')}
        </p>
        <button
          type="button"
          className="btn-primary mt-2 text-sm py-1.5"
          onClick={handleEnable}
          disabled={busy}
        >
          {busy ? t('notifications.push.enabling') : t('notifications.push.enable')}
        </button>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={t('notifications.push.bannerDismiss')}
        className="p-1 -m-1 rounded-lg text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  )
}
