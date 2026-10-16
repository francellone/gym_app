// ============================================================
// Achicar una imagen en el navegador antes de subirla (v74).
// Lado mayor a 800 px como máximo (nunca se agranda), webp 0.85 con caída
// a jpeg para Safari viejo. Una foto de celular de 3-4 MB queda en ~40-80 KB.
// ============================================================
export const MAX_SIDE = 800

/** Tamaño final que entra en un cuadrado de `max` sin deformar ni agrandar. */
export function fitWithin(w, h, max = MAX_SIDE) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
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
        if (webp && webp.type === 'image/webp') return resolve(webp)
        canvas.toBlob((jpg) => resolve(jpg), 'image/jpeg', 0.86)
      },
      'image/webp',
      0.85
    )
  })
}

/** File → Blob achicado (webp o jpeg). Rechaza con 'bad-image' si no se puede leer. */
export async function resizeImageFile(file, max = MAX_SIDE) {
  const img = await loadImage(file)
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, max)
  if (!w || !h) throw new Error('bad-image')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // Fondo blanco: un png con transparencia no queda negro al pasar a jpeg.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await canvasToBlob(canvas)
  if (!blob) throw new Error('bad-image')
  return blob
}
