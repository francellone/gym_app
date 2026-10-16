import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useExerciseImageUrl } from './useExerciseImageUrl'
import ExerciseImageViewer from './ExerciseImageViewer'

// ============================================================
// Miniatura de la imagen del ejercicio (v74). Si el ejercicio no tiene
// imagen (o no se puede firmar) NO renderiza nada: ni recuadro ni hueco
// (decisión de Franco 2026-10-15). Tocarla la abre a pantalla completa.
//
// size: lado en px (44 en filas plegadas, 56 en la tarjeta abierta).
// zoomable=false → solo la imagen, sin botón (p. ej. dentro de otro botón).
// ============================================================
export default function ExerciseThumb({ path, name, size = 44, zoomable = true, className = '' }) {
  const { t } = useTranslation()
  const url = useExerciseImageUrl(path)
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(null)
  const style = { width: size, height: size }
  // Firmando todavía: se reserva el lugar para que el nombre no salte.
  if (path && url === undefined) {
    return (
      <span
        style={style}
        aria-hidden="true"
        className={`block flex-shrink-0 rounded-xl bg-gray-100 ${className}`}
      />
    )
  }
  if (!url || broken === url) return null

  const img = (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(url)}
      className="w-full h-full object-cover"
    />
  )

  if (!zoomable) {
    return (
      <span
        style={style}
        className={`block flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 ${className}`}
      >
        {img}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        style={style}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={t('exerciseImage.view', { name })}
        className={`flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 cursor-zoom-in ${className}`}
      >
        {img}
      </button>
      {open && <ExerciseImageViewer url={url} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}
