// ============================================================
// Imágenes de ejercicios (v74) — resolver rutas a URLs firmadas
// ------------------------------------------------------------
// exercises.image_path guarda la RUTA dentro del bucket privado
// `exercise-images` (<exercise_id>/<timestamp>.webp). Mismo patrón que las
// fotos de perfil (avatars/avatarUrls.js):
//   - junta en un solo pedido todas las rutas pedidas en el mismo tick
//     (un día con 8 ejercicios = 1 request);
//   - cachea cada URL en memoria hasta 5 minutos antes de que venza;
//   - una ruta que no se puede firmar se recuerda como null un rato
//     (no se muestra nada, sin reintentar en loop).
// ============================================================
import { supabase } from '@/lib/supabase'

export const EXERCISE_IMAGE_BUCKET = 'exercise-images'
const TTL_S = 60 * 60 // 1 h
const MARGIN_MS = 5 * 60 * 1000
const MISS_MS = 2 * 60 * 1000

const cache = new Map() // path -> { url: string|null, until: number }
let queue = new Map() // path -> [resolve]
let scheduled = false

export function cachedExerciseImageUrl(path) {
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
      .from(EXERCISE_IMAGE_BUCKET)
      .createSignedUrls(paths, TTL_S)
    if (error) throw error
    rows = data || []
  } catch (err) {
    console.warn('No se pudieron firmar las imágenes de ejercicios:', err)
  }
  const byPath = new Map(rows.map((r) => [r.path, r.error ? null : r.signedUrl]))
  const now = Date.now()
  for (const [path, resolvers] of batch) {
    const url = byPath.get(path) ?? null
    cache.set(path, { url, until: url ? now + TTL_S * 1000 - MARGIN_MS : now + MISS_MS })
    resolvers.forEach((r) => r(url))
  }
}

/** URL firmada (o null) de una ruta. Agrupa los pedidos del mismo tick. */
export function getExerciseImageUrl(path) {
  if (!path) return Promise.resolve(null)
  const hit = cachedExerciseImageUrl(path)
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

/** Para la imagen recién subida: se conoce la URL sin pedirla de nuevo. */
export function primeExerciseImageUrl(path, url) {
  if (path && url) cache.set(path, { url, until: Date.now() + TTL_S * 1000 - MARGIN_MS })
}

// Solo para tests.
export function __resetExerciseImageCache() {
  cache.clear()
  queue = new Map()
  scheduled = false
}
