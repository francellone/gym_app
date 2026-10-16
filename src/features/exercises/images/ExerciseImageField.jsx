import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useExerciseImageUrl } from './useExerciseImageUrl'
import { resizeImageFile } from './resizeImage'

// ============================================================
// Campo "Imagen" del formulario del ejercicio (v74).
// No sube nada: deja el cambio pendiente y el formulario lo aplica al
// guardar (así "Cancelar" no deja archivos ni filas a medias).
//
// value:    null              → sin cambios
//           { blob }          → imagen nueva (ya achicada)
//           'remove'          → quitar la actual
// onChange(value)
// ============================================================
export default function ExerciseImageField({ currentPath, value, onChange, disabled = false }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const currentUrl = useExerciseImageUrl(value === 'remove' ? null : currentPath)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const blob = value && typeof value === 'object' ? value.blob : null
  // URL local de la imagen elegida (todavía sin subir); se libera al cambiar.
  const pendingUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => pendingUrl && URL.revokeObjectURL(pendingUrl), [pendingUrl])

  const shownUrl = blob ? pendingUrl : value === 'remove' ? null : currentUrl || null
  const hasImage = !!shownUrl

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const resized = await resizeImageFile(file)
      onChange({ blob: resized })
    } catch {
      setError(t('exerciseImage.errorRead'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="label">{t('exerciseImage.label')}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={pickFile}
        data-testid="exercise-image-input"
      />
      {hasImage ? (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <img
            src={shownUrl}
            alt={t('exerciseImage.previewAlt')}
            className="w-full h-48 object-contain bg-gray-50"
            draggable={false}
          />
          <div className="flex gap-2 p-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className="btn-secondary flex-1 inline-flex items-center justify-center gap-2 text-sm"
            >
              <Camera size={16} />
              {busy ? t('exerciseImage.processing') : t('exerciseImage.replace')}
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(currentPath ? 'remove' : null)}
              className="px-4 text-sm font-semibold text-primary-700 rounded-xl hover:bg-durazno-50"
            >
              {t('exerciseImage.remove')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="w-full h-28 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:bg-gray-50"
        >
          <ImagePlus size={22} />
          <span className="text-sm font-medium">
            {busy ? t('exerciseImage.processing') : t('exerciseImage.add')}
          </span>
        </button>
      )}
      {value === 'remove' && (
        <p className="text-xs text-amber-700">{t('exerciseImage.willRemove')}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-500">{t('exerciseImage.help')}</p>
    </div>
  )
}
