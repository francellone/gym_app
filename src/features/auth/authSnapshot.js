// ============================================================
// authSnapshot.js — pintado instantáneo del arranque (PWA cold start)
// ------------------------------------------------------------
// Cachea el último {user, profile} para saltear el spinner de "inicializando"
// al reabrir la app en frío: sembramos el estado optimista al instante y
// revalidamos la sesión de Supabase en silencio por detrás.
//
// IMPORTANTE: NO guardamos tokens de auth acá — de la sesión/refresh se encarga
// supabase-js con su propio storage. Este snapshot sólo tiene el perfil propio
// del usuario (nombre, rol, idioma) + id/email, para pintar la UI correcta
// (rol → ruta, idioma → i18n) sin esperar la red. Si la sesión resultara
// inválida, la revalidación lo corrige y redirige a /login.
//
// Pura lógica de localStorage (sin React) para testearlo aparte.
// Ver memoria [[restore-last-route-pwa]] (parte E: pintado instantáneo).
// ============================================================

const KEY = 'gym_app:auth_snapshot:v1'
// Backstop generoso: los refresh tokens de Supabase viven mucho; 30 días alcanza.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function safeLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

// Devuelve { user, profile } cacheado o null.
export function readAuthSnapshot({ now = Date.now() } = {}) {
  const ls = safeLocalStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(KEY)
    if (!raw) return null
    const env = JSON.parse(raw)
    if (!env || !env.user?.id || !env.profile) return null
    if (typeof env.savedAt !== 'number' || now - env.savedAt > MAX_AGE_MS) return null
    return { user: env.user, profile: env.profile }
  } catch {
    return null
  }
}

// Persiste el snapshot. Guarda sólo lo necesario del user (no el objeto entero).
export function writeAuthSnapshot({ user, profile, now = Date.now() } = {}) {
  const ls = safeLocalStorage()
  if (!ls || !user?.id || !profile) return false
  try {
    const slimUser = { id: user.id, email: user.email ?? null }
    ls.setItem(KEY, JSON.stringify({ savedAt: now, user: slimUser, profile }))
    return true
  } catch {
    return false
  }
}

export function clearAuthSnapshot() {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.removeItem(KEY)
  } catch {
    // no-op
  }
}
