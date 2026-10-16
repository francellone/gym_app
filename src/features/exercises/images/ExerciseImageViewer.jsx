import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ============================================================
// Imagen del ejercicio a pantalla completa (v74). Se cierra tocando en
// cualquier lado o con Escape. Va en un portal para que ningún contenedor
// con overflow/transform la recorte.
// ============================================================
export default function ExerciseImageViewer({ url, name, onClose }) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!url || typeof document === 'undefined') return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name || t('exerciseImage.viewerTitle')}
      className="fixed inset-0 z-[70]"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose?.()
        }}
        aria-label={t('exerciseImage.close')}
        className="absolute inset-0 w-full h-full bg-black/90 flex flex-col items-center justify-center gap-4 p-4 cursor-zoom-out"
      >
        <span className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
          <X size={22} className="text-white" />
        </span>
        <img
          src={url}
          alt={name || ''}
          className="max-w-full max-h-[75vh] object-contain rounded-xl bg-white"
          draggable={false}
        />
        {name && <span className="text-white text-lg font-semibold text-center">{name}</span>}
        <span className="text-white/70 text-xs">{t('exerciseImage.tapToClose')}</span>
      </button>
    </div>,
    document.body
  )
}
