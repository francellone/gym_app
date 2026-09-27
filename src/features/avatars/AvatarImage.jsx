import { useEffect, useState } from 'react'
import { cachedAvatarUrl, getAvatarUrl } from './avatarUrls'

// ============================================================
// Contenido de un círculo de avatar: la foto si la persona tiene y se puede
// firmar; si no, lo que venga como children (las iniciales de siempre).
// Va ADENTRO del contenedor existente, que debe tener overflow-hidden, así
// cada pantalla conserva su tamaño y estilo.
// ============================================================
export default function AvatarImage({ path, alt = '', children }) {
  const [state, setState] = useState(() => ({ path, url: cachedAvatarUrl(path) }))
  const [broken, setBroken] = useState(null)
  const url = state.path === path ? state.url : cachedAvatarUrl(path)

  useEffect(() => {
    if (!path) return
    let alive = true
    getAvatarUrl(path).then((u) => alive && setState({ path, url: u }))
    return () => {
      alive = false
    }
  }, [path])

  if (!path || !url || broken === url) return children ?? null
  return (
    <img
      src={url}
      alt={alt}
      className="w-full h-full object-cover rounded-full"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(url)}
    />
  )
}
