import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, X } from 'lucide-react'

// Aviso de instalación para iOS (doc: iphone-pwa-support).
// Safari no sugiere instalar la PWA (a diferencia de Chrome/Android),
// así que se lo explicamos nosotros. Solo se muestra si:
//   - el dispositivo es iOS (iPhone/iPad, incluye iPadOS que se
//     presenta como MacIntel con pantalla táctil), y
//   - la app NO está corriendo ya instalada (standalone), y
//   - el usuario no lo descartó antes (persistido en localStorage).

const DISMISS_KEY = 'gymcoach-ios-install-dismissed'

function isIos() {
  const ua = window.navigator.userAgent
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || isIpadOs
}

function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true // legacy Safari
  )
}

export default function IosInstallBanner({ offsetClass = 'bottom-4' }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (dismissed || !isIos() || isInstalled()) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      className={`fixed ${offsetClass} inset-x-3 z-50 max-w-md mx-auto
                  bg-white border border-gray-200 shadow-lg rounded-2xl
                  px-4 py-3 flex items-start gap-3`}
      role="status"
    >
      <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <Share size={18} className="text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{t('iosInstall.title')}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          {t('iosInstall.body1')} <Share size={12} className="inline -mt-0.5 text-primary-600" />{' '}
          {t('iosInstall.body2')}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label={t('iosInstall.dismiss')}
        className="p-1 -m-1 rounded-lg text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  )
}
