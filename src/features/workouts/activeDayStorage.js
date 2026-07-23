// ============================================================
// activeDayStorage.js — persistencia local del "día activo" del alumno
// en la pantalla de entrenamiento (opción B, complemento de RouteMemory).
// ------------------------------------------------------------
// RouteMemory ya te devuelve a /student/workout al reabrir la app, pero
// iOS recarga la PWA en frío, así que el día/pestaña que tenías abierto
// (ej. "día B de fuerza") se resetea al día auto-sugerido. Acá guardamos
// ese día por alumno para restaurarlo tras la recarga.
//
// Igual que draftStorage.js: funciones puras + storage inyectable
// (default window.localStorage), tolerante a Safari privado / SSR.
//
// Scope por (alumno + loggedDate): el día se restaura solo si volvés el
// MISMO día que lo abriste. Si volvés otro día, `resolveActiveDay`
// devuelve null y la pantalla vuelve a auto-sugerir el "siguiente día
// lógico" (comportamiento original). El TTL es solo un backstop de
// higiene.
// ============================================================

export const KEY_PREFIX = 'gym_app:active_day'
export const SCHEMA_VERSION = 1

// Backstop: aunque el loggedDate coincida, no restaurar entradas más
// viejas que esto (ej. reloj raro). 16h cubre cualquier jornada.
export const DEFAULT_TTL_MS = 16 * 60 * 60 * 1000

// gym_app:active_day:v{N}:{studentId}
export function buildKey(studentId) {
  if (!studentId) return null
  return `${KEY_PREFIX}:v${SCHEMA_VERSION}:${studentId}`
}

// Envelope { v, savedAt, dayId, loggedDate }.
export function wrapEnvelope({ dayId, loggedDate, savedAt }) {
  return JSON.stringify({
    v: SCHEMA_VERSION,
    savedAt: savedAt || new Date().toISOString(),
    dayId,
    loggedDate,
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
  if (typeof env.dayId !== 'string' || env.dayId.length === 0) return null
  if (typeof env.loggedDate !== 'string' || env.loggedDate.length === 0) return null
  return { v: env.v, savedAt: env.savedAt, dayId: env.dayId, loggedDate: env.loggedDate }
}

export function isExpired(savedAtIso, ttlMs = DEFAULT_TTL_MS, nowMs) {
  if (typeof savedAtIso !== 'string') return true
  const savedMs = Date.parse(savedAtIso)
  if (!Number.isFinite(savedMs)) return true
  const now = nowMs != null ? nowMs : Date.now()
  return now - savedMs >= ttlMs
}

function getStorage(storage) {
  if (storage === null || storage === false) return null
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

export function saveActiveDay({ studentId, dayId, loggedDate, storage, savedAt }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildKey(studentId)
  if (!key || !dayId || !loggedDate) return false
  try {
    s.setItem(key, wrapEnvelope({ dayId, loggedDate, savedAt }))
    return true
  } catch {
    return false
  }
}

export function readActiveDay({ studentId, storage }) {
  const s = getStorage(storage)
  if (!s) return null
  const key = buildKey(studentId)
  if (!key) return null
  try {
    return parseEnvelope(s.getItem(key))
  } catch {
    return null
  }
}

export function clearActiveDay({ studentId, storage }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildKey(studentId)
  if (!key) return false
  try {
    s.removeItem(key)
    return true
  } catch {
    return false
  }
}

// ── Decisión de restauración ──────────────────────────────────
// Devuelve el dayId a restaurar, o null si hay que auto-sugerir.
// Reglas: existe, no expiró, es del MISMO loggedDate que estamos viendo,
// y sigue estando entre los días disponibles del plan.
export function resolveActiveDay({
  studentId,
  loggedDate,
  availableDays,
  storage,
  ttlMs = DEFAULT_TTL_MS,
  nowMs,
}) {
  const env = readActiveDay({ studentId, storage })
  if (!env) return null
  if (isExpired(env.savedAt, ttlMs, nowMs)) return null
  if (env.loggedDate !== loggedDate) return null
  if (!Array.isArray(availableDays) || !availableDays.includes(env.dayId)) return null
  return env.dayId
}
