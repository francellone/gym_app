// ============================================================
// draftStorage.js — helpers puros para drafts locales de workout_logs
// ------------------------------------------------------------
// F4 (doc 23, 2026-05-24): persistencia local de lo que el alumno tipea
// en ExerciseCard mientras carga una serie, para que no se pierda si
// bloquea pantalla o cierra la app antes de presionar "Guardar".
//
// Este módulo NO toca React ni el DOM directamente: expone funciones
// puras para que sean testeables sin jsdom + un par de helpers que
// reciben el objeto `storage` por inyección (default `window.localStorage`).
// El hook React vive en hooks/useLocalStorageDraft.js.
//
// Decisión Opción A (localStorage) sobre B/C (BD on-blur / debounce):
// cero impacto en BD, reports, alertas G2, RLS. Ver doc 23 §3.
// ============================================================

// ── Constantes ─────────────────────────────────────────────────
// Prefijo namespaceado para evitar colisión con otros features.
export const KEY_PREFIX = 'gym_app:workout_draft'

// Versión del schema del envelope. Si cambia el shape del payload,
// subir a 2 y barrer las claves v1 en cleanupStaleDrafts.
export const SCHEMA_VERSION = 1

// TTL default: 8 horas. Cubre el caso "alumno arranca 7am, frena,
// vuelve 13hs" sin restaurar drafts de días anteriores.
export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000

// Cleanup oportunista al boot: borrar drafts con loggedDate más viejos
// que esto, sin importar TTL. 7 días = más que cualquier sesión razonable.
export const DEFAULT_MAX_AGE_DAYS = 7

// ── buildDraftKey / parseDraftKey ──────────────────────────────
// Convención: gym_app:workout_draft:v{N}:{studentId}:{planExerciseId}:{loggedDate}
// Granularidad: un draft por (alumno, ejercicio del plan, fecha).
export function buildDraftKey({ studentId, planExerciseId, loggedDate }) {
  if (!studentId || !planExerciseId || !loggedDate) return null
  return `${KEY_PREFIX}:v${SCHEMA_VERSION}:${studentId}:${planExerciseId}:${loggedDate}`
}

export function parseDraftKey(key) {
  if (typeof key !== 'string' || !key.startsWith(`${KEY_PREFIX}:`)) return null
  const rest = key.slice(KEY_PREFIX.length + 1) // saltea "gym_app:workout_draft:"
  const parts = rest.split(':')
  // Esperamos exactamente 4 partes: v{N}, studentId, planExerciseId, loggedDate
  if (parts.length !== 4) return null
  const [versionToken, studentId, planExerciseId, loggedDate] = parts
  if (!versionToken.startsWith('v')) return null
  const version = parseInt(versionToken.slice(1), 10)
  if (!Number.isFinite(version)) return null
  return { version, studentId, planExerciseId, loggedDate }
}

// ── Envelope (serialización) ──────────────────────────────────
// Envolvemos el payload del alumno en { v, savedAt, payload } para:
//   - Versionar (parsing defensivo si cambia el shape).
//   - Tener `savedAt` para TTL.
// `savedAt` opcional permite tests deterministas; default = ahora.
export function wrapDraftEnvelope(payload, savedAt) {
  const env = {
    v: SCHEMA_VERSION,
    savedAt: savedAt || new Date().toISOString(),
    payload,
  }
  return JSON.stringify(env)
}

export function parseDraftEnvelope(raw) {
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
  if (env.payload == null || typeof env.payload !== 'object') return null
  return { v: env.v, savedAt: env.savedAt, payload: env.payload }
}

// ── TTL ────────────────────────────────────────────────────────
export function isDraftExpired(savedAtIso, ttlMs = DEFAULT_TTL_MS, nowMs) {
  if (typeof savedAtIso !== 'string') return true
  const savedMs = Date.parse(savedAtIso)
  if (!Number.isFinite(savedMs)) return true
  const now = nowMs != null ? nowMs : Date.now()
  return now - savedMs >= ttlMs
}

// ── Storage access helpers ─────────────────────────────────────
// Wrappers con try/catch para tolerar:
//   - iOS Safari modo privado (lanza al escribir).
//   - QuotaExceededError si el localStorage está lleno.
//   - Entornos sin localStorage (SSR, jsdom sin polyfill).
// En todos esos casos degradamos silenciosamente al estado actual
// (sin draft) sin romper la UI.
function getStorage(storage) {
  // null/false explícitos = deshabilitar (útil en tests + para forzar degradación).
  if (storage === null || storage === false) return null
  // Objeto truthy: usarlo (storage inyectado).
  if (storage) return storage
  // undefined: fallback al window.localStorage.
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

export function readDraft(key, storage) {
  const s = getStorage(storage)
  if (!s) return null
  try {
    const raw = s.getItem(key)
    return parseDraftEnvelope(raw)
  } catch {
    return null
  }
}

export function writeDraft(key, payload, storage, savedAt) {
  const s = getStorage(storage)
  if (!s) return false
  try {
    s.setItem(key, wrapDraftEnvelope(payload, savedAt))
    return true
  } catch {
    return false
  }
}

export function removeDraft(key, storage) {
  const s = getStorage(storage)
  if (!s) return false
  try {
    s.removeItem(key)
    return true
  } catch {
    return false
  }
}

// ── Cleanup oportunista ────────────────────────────────────────
// Al boot de TodayWorkoutPage, barrer:
//   - Drafts con loggedDate más viejos que `maxAgeDays`.
//   - Drafts de un studentId distinto al actual (cambio de cuenta en
//     mismo browser, raro pero posible en testing).
//   - Drafts cuyo envelope no parsea (corruptos / versión vieja).
// Retorna la cantidad de claves borradas (útil para tests + log).
//
// `now` y `storage` son inyectables para testing.
export function cleanupStaleDrafts({
  studentId,
  now,
  storage,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const s = getStorage(storage)
  if (!s) return 0

  let keys
  try {
    keys = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith(`${KEY_PREFIX}:`)) keys.push(k)
    }
  } catch {
    return 0
  }

  const nowMs = now != null ? (typeof now === 'number' ? now : Date.parse(now)) : Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  let removed = 0

  for (const key of keys) {
    let shouldRemove = false
    const parsed = parseDraftKey(key)

    if (!parsed) {
      // Key con shape inesperado: barrer.
      shouldRemove = true
    } else if (parsed.version !== SCHEMA_VERSION) {
      // Version vieja: barrer.
      shouldRemove = true
    } else if (studentId && parsed.studentId !== studentId) {
      // Otro alumno en el mismo browser.
      shouldRemove = true
    } else {
      // loggedDate viejo (más de `maxAgeDays`).
      const dateMs = Date.parse(parsed.loggedDate)
      if (!Number.isFinite(dateMs) || nowMs - dateMs > maxAgeMs) {
        shouldRemove = true
      } else {
        // TTL del envelope (puede estar expirado aunque la fecha sea reciente).
        const env = readDraft(key, s)
        if (!env || isDraftExpired(env.savedAt, ttlMs, nowMs)) {
          shouldRemove = true
        }
      }
    }

    if (shouldRemove) {
      if (removeDraft(key, s)) removed += 1
    }
  }

  return removed
}
