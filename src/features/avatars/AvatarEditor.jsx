import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, X, ZoomIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { AVATAR_BUCKET, primeAvatarUrl } from './avatarUrls'
import { clampOffset, coverScale, drawRect } from './cropMath'

// ============================================================
// Subir / cambiar / quitar la foto de perfil (v57).
// Solo la persona dueña de la cuenta (decisión de Franco 2026-09-27).
// La persona encuadra en un círculo (arrastrar + zoom) y la foto se achica
// a 256 px en el navegador antes de subirla: pesa ~15-30 KB.
// ============================================================

const VIEW = 240 // lado del visor en px
const OUT = 256 // lado de la imagen final
const MAX_ZOOM = 4

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('bad-image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        // Safari viejo no exporta webp: devuelve png o null. Caemos a jpeg.
        if (webp && webp.type === 'image/webp') return resolve(webp)
        canvas.toBlob((jpg) => resolve(jpg), 'image/jpeg', 0.88)
      },
      'image/webp',
      0.85
    )
  })
}

export default function AvatarEditor({
  userId,
  currentPath,
  onClose,
  onSaved,
  privacyText = null,
}) {
  const { t } = useTranslation()
  const inputRef = useRef(null)
  const drag = useRef(null)
  const [src, setSrc] = useState(null) // { img, url }
  const [zoom, setZoom] = useState(1) // multiplicador sobre la escala mínima
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => () => src && URL.revokeObjectURL(src.url), [src])

  const iw = src?.img.naturalWidth || 1
  const ih = src?.img.naturalHeight || 1
  const scale = coverScale(iw, ih, VIEW) * zoom

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const loaded = await loadImage(file)
      setSrc(loaded)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    } catch {
      setError(t('profile.photoErrorRead'))
    }
  }

  function onPointerDown(e) {
    if (!src) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, start: offset }
  }
  function onPointerMove(e) {
    if (!drag.current) return
    const next = {
      x: drag.current.start.x + (e.clientX - drag.current.x),
      y: drag.current.start.y + (e.clientY - drag.current.y),
    }
    setOffset(clampOffset(next, iw, ih, scale, VIEW))
  }
  function onPointerUp() {
    drag.current = null
  }
  function changeZoom(z) {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z))
    setZoom(nz)
    setOffset((o) => clampOffset(o, iw, ih, coverScale(iw, ih, VIEW) * nz, VIEW))
  }

  async function save() {
    if (!src) return
    setBusy(true)
    setError(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUT
      canvas.height = OUT
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      const r = drawRect(iw, ih, scale, offset, VIEW, OUT)
      ctx.drawImage(src.img, r.dx, r.dy, r.dw, r.dh)
      const blob = await canvasToBlob(canvas)
      if (!blob) throw new Error('encode')
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`

      const up = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '3600' })
      if (up.error) throw up.error

      const { error: e2 } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('id', userId)
        .select('id')
        .single()
      if (e2) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path])
        throw e2
      }
      primeAvatarUrl(path, URL.createObjectURL(blob))
      if (currentPath && currentPath !== path) {
        supabase.storage
          .from(AVATAR_BUCKET)
          .remove([currentPath])
          .catch(() => {})
      }
      await onSaved?.(path)
    } catch (err) {
      console.error('Error subiendo la foto:', err)
      setError(t('profile.photoErrorSave'))
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId)
        .select('id')
        .single()
      if (e) throw e
      if (currentPath)
        supabase.storage
          .from(AVATAR_BUCKET)
          .remove([currentPath])
          .catch(() => {})
      await onSaved?.(null)
    } catch (err) {
      console.error('Error quitando la foto:', err)
      setError(t('profile.photoErrorSave'))
      setBusy(false)
    }
  }

  const imgStyle = src && {
    width: iw * scale,
    height: ih * scale,
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-tinta/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 text-sm">{t('profile.photoTitle')}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5" disabled={busy} aria-label="×">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />

          {src ? (
            <>
              <div
                className="relative mx-auto overflow-hidden rounded-2xl bg-gray-900 touch-none select-none cursor-grab active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
              >
                <img
                  src={src.url}
                  alt=""
                  draggable={false}
                  className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                  style={imgStyle}
                />
                {/* Máscara: todo lo que queda fuera del círculo, oscurecido */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-full"
                  style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
                />
              </div>
              <label className="flex items-center gap-3 text-gray-500">
                <ZoomIn size={16} className="flex-shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => changeZoom(Number(e.target.value))}
                  className="w-full accent-primary-600"
                  aria-label={t('profile.photoZoom')}
                />
              </label>
              <p className="text-xs text-gray-500 text-center">{t('profile.photoHint')}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-gray-200 py-10 flex flex-col items-center gap-2 text-gray-500 hover:bg-gray-50"
            >
              <Camera size={28} />
              <span className="text-sm font-medium">{t('profile.photoChoose')}</span>
            </button>
          )}

          <p className="text-[11px] text-gray-400 text-center leading-snug">
            {privacyText ?? t('profile.photoPrivacy')}
          </p>

          {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

          <div className="flex gap-2 justify-between items-center pt-1">
            {currentPath && !src ? (
              <button
                className="btn-ghost text-red-600 text-sm flex items-center gap-1.5"
                onClick={remove}
                disabled={busy}
              >
                <Trash2 size={15} />
                {t('profile.photoRemove')}
              </button>
            ) : src ? (
              <button
                className="btn-ghost text-sm"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                {t('profile.photoOther')}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </button>
              {src && (
                <button className="btn-primary" onClick={save} disabled={busy}>
                  {busy ? t('profile.photoSaving') : t('common.save')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
