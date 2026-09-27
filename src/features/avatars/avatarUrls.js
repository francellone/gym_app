// ============================================================
// Fotos de perfil (v57) — resolver rutas a URLs firmadas
// ------------------------------------------------------------
// profiles.avatar_url guarda la RUTA dentro del bucket privado `avatars`
// (<user_id>/<timestamp>.webp). Para mostrarla hace falta una URL firmada,
// que vence. Este módulo:
//   - junta en un solo pedido todas las rutas que se piden en el mismo tick
//     (una lista de 30 personas = 1 request, no 30);
//   - cachea en memoria cada URL hasta 5 minutos antes de que venza;
//   - si una ruta no se puede firmar (sin permiso, borrada) la recuerda como
//     null un rato para no reintentar en loop: se muestran las iniciales.
// ============================================================
import { supabase } from '@/lib/supabase'

export const AVATAR_BUCKET = 'avatars'
const TTL_S = 60 * 60 // 1 h
const MARGIN_MS = 5 * 60 * 1000
const MISS_MS = 2 * 60 * 1000

const cache = new Map() // path -> { url: string|null, until: number }
let queue = new Map() // path -> [resolve]
let scheduled = false

export function cachedAvatarUrl(path) {
  if (!path) return null
  const hit = cache.get(path)
  return hit && hit.until > Date.now() ? hit.url : undefined
}

async function flush() {
  scheduled = false
  const batch = queue
  queue = new Map()
  const paths = [...batch.keys()]
  let rows = []
  try {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(paths, TTL_S)
    if (error) throw error
    rows = data || []
  } catch (err) {
    console.warn('No se pudieron firmar las fotos de perfil:', err)
  }
  const byPath = new Map(rows.map((r) => [r.path, r.error ? null : r.signedUrl]))
  const now = Date.now()
  for (const [path, resolvers] of batch) {
    const url = byPath.get(path) ?? null
    cache.set(path, { url, until: url ? now + TTL_S * 1000 - MARGIN_MS : now + MISS_MS })
    resolvers.forEach((r) => r(url))
  }
}

/** Devuelve la URL firmada (o null) de una ruta. Agrupa pedidos del mismo tick. */
export function getAvatarUrl(path) {
  if (!path) return Promise.resolve(null)
  const hit = cachedAvatarUrl(path)
  if (hit !== undefined) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const list = queue.get(path)
    if (list) list.push(resolve)
    else queue.set(path, [resolve])
    if (!scheduled) {
      scheduled = true
      setTimeout(flush, 0)
    }
  })
}

/** Para la foto recién subida: se conoce la URL sin pedirla de nuevo. */
export function primeAvatarUrl(path, url) {
  if (path && url) cache.set(path, { url, until: Date.now() + TTL_S * 1000 - MARGIN_MS })
}

export function initialsOf(name, max = 2) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

// Solo para tests.
export function __resetAvatarCache() {
  cache.clear()
  queue = new Map()
  scheduled = false
}
