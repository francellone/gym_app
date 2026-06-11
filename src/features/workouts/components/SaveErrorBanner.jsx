import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

// Banner visible cuando hay un error de save (asociado a useSaveErrorBanner).
// Recibe el `banner` directamente del hook y un `onDismiss` para cerrar.
// Si `banner` es null no renderiza nada.
//
// Modo persistent (banner.persistent=true): no auto-cierra, requiere click
// en "Entendido". Usado para errores que el alumno necesita reconocer (PSE
// retroactivo que rompe constraint, etc.).
// Modo recuperable (banner.persistent=false): auto-cierra a los 6s, también
// con × en la esquina.
export default function SaveErrorBanner({ banner, onDismiss }) {
  const { t } = useTranslation()
  if (!banner) return null
  return (
    <div
      className={`rounded-xl p-3 flex items-start gap-2 ${
        banner.persistent
          ? 'bg-rose-100 border-2 border-rose-300 shadow-sm'
          : 'bg-rose-50 border-2 border-rose-200'
      }`}
    >
      <AlertTriangle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed">
        <p className="text-xs text-rose-800">{banner.message}</p>
        {banner.persistent && (
          <button
            onClick={onDismiss}
            className="mt-2 text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg transition"
          >
            {t('workout.understood')}
          </button>
        )}
      </div>
      {!banner.persistent && (
        <button
          onClick={onDismiss}
          className="text-rose-500 hover:text-rose-700 flex-shrink-0"
          aria-label={t('workout.closeNotice')}
        >
          ×
        </button>
      )}
    </div>
  )
}
