// ============================================================
// workoutViewState.js — estado de VISTA de la pantalla de entrenamiento
// (complemento de RouteMemory + activeDayStorage).
// ------------------------------------------------------------
// Al reabrir la app, iOS/Android recargan en frío y se pierde:
//   1. Qué bloque de ejercicios estaba DESPLEGADO (cada run card arranca
//      colapsado con useState(false)).
//   2. La posición de scroll (volvés al tope de la página).
// Estos helpers persisten ambas cosas para que el alumno vuelva justo
// donde estaba cargando.
//
// Igual que draftStorage/activeDayStorage: funciones puras + storage
// inyectable (default window.localStorage), tolerante a Safari privado.
//
// Scope por día (loggedDate): solo se restaura si volvés el MISMO día;
// otro día arranca fresco (bloques colapsados, scroll arriba). TTL = backstop.
// ============================================================

export const EXP_KEY_PREFIX = 'gym_app:block_expanded'
export const SCROLL_KEY_PREFIX = 'gym_app:workout_scroll'
export const SCHEMA_VERSION = 1

// Backstop de higiene (mismo día ya lo acota; esto cubre relojes raros).
export const DEFAULT_TTL_MS = 16 * 60 * 60 * 1000

// ── Storage wrapper (tolerante a Safari privado / SSR / quota) ──
function getStorage(storage) {
  if (storage === null || storage === false) return null
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return null
}

export function isExpired(savedAtIso, ttlMs = DEFAULT_TTL_MS, nowMs) {
  if (typeof savedAtIso !== 'string') return true
  const savedMs = Date.parse(savedAtIso)
  if (!Number.isFinite(savedMs)) return true
  const now = nowMs != null ? nowMs : Date.now()
  return now - savedMs >= ttlMs
}

// ── Bloque desplegado ──────────────────────────────────────────
// Un registro por bloque: gym_app:block_expanded:v{N}:{blockId}
// Envelope { v, savedAt, loggedDate, expanded }.
export function buildExpKey(blockId) {
  if (!blockId && blockId !== 0) return null
  return `${EXP_KEY_PREFIX}:v${SCHEMA_VERSION}:${blockId}`
}

export function writeExpanded({ blockId, loggedDate, expanded, storage, savedAt }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildExpKey(blockId)
  if (!key || !loggedDate) return false
  try {
    s.setItem(
      key,
      JSON.stringify({
        v: SCHEMA_VERSION,
        savedAt: savedAt || new Date().toISOString(),
        loggedDate,
        expanded: !!expanded,
      })
    )
    return true
  } catch {
    return false
  }
}

// Devuelve true solo si hay un registro desplegado, del mismo loggedDate y
// no expirado. En cualquier otro caso false (arranca colapsado).
export function readExpanded({ blockId, loggedDate, storage, ttlMs = DEFAULT_TTL_MS, nowMs }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildExpKey(blockId)
  if (!key || !loggedDate) return false
  try {
    const raw = s.getItem(key)
    if (!raw) return false
    const env = JSON.parse(raw)
    if (!env || env.v !== SCHEMA_VERSION) return false
    if (env.loggedDate !== loggedDate) return false
    if (isExpired(env.savedAt, ttlMs, nowMs)) return false
    return !!env.expanded
  } catch {
    return false
  }
}

// ── Posición de scroll ─────────────────────────────────────────
// Un registro por alumno: gym_app:workout_scroll:v{N}:{studentId}
// Envelope { v, savedAt, loggedDate, y }.
export function buildScrollKey(studentId) {
  if (!studentId) return null
  return `${SCROLL_KEY_PREFIX}:v${SCHEMA_VERSION}:${studentId}`
}

export function writeScroll({ studentId, loggedDate, y, storage, savedAt }) {
  const s = getStorage(storage)
  if (!s) return false
  const key = buildScrollKey(studentId)
  if (!key || !loggedDate || typeof y !== 'number' || !Number.isFinite(y)) return false
  try {
    s.setItem(
      key,
      JSON.stringify({
        v: SCHEMA_VERSION,
        savedAt: savedAt || new Date().toISOString(),
        loggedDate,
        y: Math.max(0, Math.round(y)),
      })
    )
    return true
  } catch {
    return false
  }
}

// Devuelve la Y a restaurar (número >= 0), o null si no aplica (otro día,
// expirado, o nada guardado).
export function readScroll({ studentId, loggedDate, storage, ttlMs = DEFAULT_TTL_MS, nowMs }) {
  const s = getStorage(storage)
  if (!s) return null
  const key = buildScrollKey(studentId)
  if (!key || !loggedDate) return null
  try {
    const raw = s.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw)
    if (!env || env.v !== SCHEMA_VERSION) return null
    if (env.loggedDate !== loggedDate) return null
    if (isExpired(env.savedAt, ttlMs, nowMs)) return null
    if (typeof env.y !== 'number' || !Number.isFinite(env.y)) return null
    return Math.max(0, env.y)
  } catch {
    return null
  }
}
