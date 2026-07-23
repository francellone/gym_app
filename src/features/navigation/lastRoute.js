// ============================================================
// lastRoute.js — helpers puros para recordar/restaurar la última
// pantalla del usuario (opción A).
// ------------------------------------------------------------
// Problema: en iOS la PWA instalada se relanza SIEMPRE desde el
// start_url ("/"), así que al reabrir la app se pierde la pantalla
// donde estabas y caés en el inicio. Estos helpers persisten la
// última ruta "profunda" (no-inicio) por usuario y deciden si hay
// que restaurarla al abrir.
//
// Igual que draftStorage.js: NO tocan React ni el DOM. Funciones
// puras + wrappers de storage inyectable (default window.localStorage),
// para que sean testeables sin jsdom. El glue React vive en
// RouteMemory.jsx.
// ============================================================

// Prefijo namespaceado, consistente con draftStorage (gym_app:...).
export const KEY_PREFIX = 'gym_app:last_route'

// Versión del envelope. Si cambia el shape, subir a 2.
export const SCHEMA_VERSION = 1

// Caducidad: si la última visita fue hace más de esto, NO restauramos
// (la app arranca normal en el inicio). 8h alinea con el TTL de los
// drafts de workout: "arranca 7am, vuelve 13hs" restaura; "vuelve al
// otro día" no.
export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000

// Rutas "landing" que NO guardamos como última pantalla: el login y los
// inicios de cada rol. Son el destino por defecto — restaurarlas no
// aporta nada y ensucia la detección de "arranque en frío".
const LANDING_PATHS = new Set(['/', '/login', '/coach', '/student'])

// gym_app:last_route:v{N}:{userId}
export function buildKey(userId) {
  if (!userId) return null
  return `${KEY_PREFIX}:v${SCHEMA_VERSION}:${userId}`
}

// ¿Esta ruta es "profunda" y vale la pena recordarla?
export function isRestorablePath(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return false
  if (!pathname.startsWith('/')) return false
  // Comparamos solo el pathname (sin querystring) contra las landings,
  // normalizando un eventual trailing slash.
  const rawPath = pathname.split('?')[0]
  const normalized =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
  return !LANDING_PATHS.has(normalized)
}

// ¿La ruta pertenece al rol actual? Evita mandar un alumno a /coach y
// viceversa tras un cambio de cuenta en el mismo browser.
export function pathMatchesRole(pathname, role) {
  if (typeof pathname !== 'string') return false
  if (role === 'coach') return pathname === '/coach' || pathname.startsWith('/coach/')
  if (role === 'student') return pathname === '/student' || pathname.startsWith('/student/')
  return false
}

// Envelope { v, savedAt, path } — versionado + timestamp para TTL.
// `savedAt` opcional permite tests deterministas; default = ahora.
export function wrapEnvelope(path, savedAt) {
  return JSON.stringify({
    v: SCHEMA_VERSION,
    savedAt: savedAt || new Date().toISOString(),
    path,
  })
}

export function parseEnvelope(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let env
  try {
    env = JSON.parse(raw)
  } catch {
    return null
  }
  if (!env || typeof env !== 'object') return null
  if (env.v !== SCHEMA_VERSION) return null
  if (typeof env.savedAt !== 'string') return null
  if (typeof env.path !== 'string' || env.path.length === 0) return null
  return { v: env.v, savedAt: env.savedAt, path: env.path }
}

export function isExpired(savedAtIso, ttlMs = DEFAULT_TTL_MS, nowMs) {
  if (typeof savedAtIso !== 'string') return true
  const savedMs = Date.parse(savedAtIso)
  if (!Number.isFinite(savedMs)) return true
  const now = nowMs != null ? nowMs : Date.now()
  return now - savedMs >= ttlMs
}

// ── Storage wrappers (tolerantes a Safari privado / SSR / quota) ──
function getStorage(storage) {
  // null/false explícitos = deshabilitar (tests + forzar degradación).
  if (storage === null || storage === false) return null
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

export function saveLastRoute({ userId, path, storage, savedAt }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildKey(userId)
  // Solo guardamos rutas profundas: las landings se ignoran.
  if (!key || !isRestorablePath(path)) return false
  try {
    s.setItem(key, wrapEnvelope(path, savedAt))
    return true
  } catch {
    return false
  }
}

export function readLastRoute({ userId, storage }) {
  const s = getStorage(storage)
  if (!s) return null
  const key = buildKey(userId)
  if (!key) return null
  try {
    return parseEnvelope(s.getItem(key))
  } catch {
    return null
  }
}

export function clearLastRoute({ userId, storage }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildKey(userId)
  if (!key) return false
  try {
    s.removeItem(key)
    return true
  } catch {
    return false
  }
}

// ── Decisión de restauración ──────────────────────────────────
// Devuelve la ruta a restaurar, o null si no hay que hacer nada.
// Reglas:
//   - Solo restauramos si el arranque cayó en una landing (inicio),
//     señal de relanzamiento en frío. Si ya estamos en una ruta
//     profunda (ej. deep-link de una notificación), NO la pisamos.
//   - La guardada debe existir, no estar expirada, pertenecer al rol
//     actual y ser distinta de donde estamos parados.
export function computeRestoreTarget({
  currentPath,
  role,
  userId,
  storage,
  ttlMs = DEFAULT_TTL_MS,
  nowMs,
}) {
  // Ya estamos en una ruta profunda → respetarla (deep-link).
  if (isRestorablePath(currentPath)) return null
  const env = readLastRoute({ userId, storage })
  if (!env) return null
  if (isExpired(env.savedAt, ttlMs, nowMs)) return null
  if (!pathMatchesRole(env.path, role)) return null
  if (env.path === currentPath) return null
  return env.path
}
