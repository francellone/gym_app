// ============================================================
// workoutSnapshot.js — pintado instantáneo del entrenamiento (PWA cold start)
// ------------------------------------------------------------
// Problema: al salir y reabrir la app desde el celular, el sistema operativo
// (iOS/Android) descarga la PWA de memoria y el navegador la arranca EN FRÍO
// (recarga total). Una PWA no puede evitar ese cold start como sí lo hace una
// app nativa (Instagram) que el SO mantiene viva. Lo que sí podemos hacer es
// que el cold start sea INVISIBLE: guardar el último "estado pintado" del
// entrenamiento y pintarlo al instante, mientras fetchWorkout revalida en
// silencio por detrás (stale-while-revalidate).
//
// Este módulo es pura lógica de localStorage (sin React) para testearlo aparte.
// Ver memoria [[restore-last-route-pwa]] (parte E: pintado instantáneo).
//
// Diseño:
//   - Clave versionada y scopeada por alumno+fecha:
//       gym_app:workout_snapshot:v1:{studentId}:{selectedDate}
//     Al cambiar el día (nueva fecha = nuevo "hoy") la clave no coincide y se
//     cae al spinner normal (primer arranque del día). Correcto.
//   - Envelope {studentId, selectedDate, savedAt, data} — se valida en lectura
//     para no pintar datos de otro alumno/día ni datos rancios (TTL backstop).
//   - Un solo snapshot a la vez: al escribir se barren los demás para acotar
//     el storage.
//   - Guard de cuota: si el snapshot serializado excede MAX_BYTES, se recortan
//     los arrays "secundarios" (última vez / notas), preservando lo primario
//     (ejercicios/bloques/logs/día) que es lo que pinta la vista. Lo recortado
//     se re-trae en la revalidación silenciosa.
// ============================================================

const KEY_PREFIX = 'gym_app:workout_snapshot:v1:'
// Backstop de frescura: más viejo que esto => no pintar (revalida con spinner).
const MAX_AGE_MS = 36 * 60 * 60 * 1000 // 36h
// Tope de tamaño del snapshot para no reventar la cuota de localStorage (~5MB).
const MAX_BYTES = 1_500_000 // ~1.5MB

function safeLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

export function snapshotKey({ studentId, selectedDate } = {}) {
  if (!studentId || !selectedDate) return null
  return `${KEY_PREFIX}${studentId}:${selectedDate}`
}

// Devuelve el objeto `data` cacheado para (studentId, selectedDate) o null.
export function readWorkoutSnapshot({ studentId, selectedDate, now = Date.now() } = {}) {
  const ls = safeLocalStorage()
  const key = snapshotKey({ studentId, selectedDate })
  if (!ls || !key) return null
  try {
    const raw = ls.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw)
    if (!env || env.studentId !== studentId || env.selectedDate !== selectedDate) return null
    if (typeof env.savedAt !== 'number' || now - env.savedAt > MAX_AGE_MS) return null
    return env.data ?? null
  } catch {
    return null
  }
}

// Recorta arrays secundarios cuando el snapshot excede MAX_BYTES.
function trimForQuota(data) {
  try {
    if (JSON.stringify(data).length <= MAX_BYTES) return data
  } catch {
    // Si ni siquiera serializa, devolvemos un objeto vacío defensivo.
    return {}
  }
  return {
    ...data,
    recentExerciseLogs: [],
    recentBlockLogs: [],
    exerciseNotes: [],
  }
}

function dropAllSnapshots(ls, exceptKey) {
  try {
    const toDrop = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k && k.startsWith(KEY_PREFIX) && k !== exceptKey) toDrop.push(k)
    }
    toDrop.forEach((k) => ls.removeItem(k))
  } catch {
    // no-op
  }
}

// Persiste el snapshot. Devuelve true si quedó guardado.
export function writeWorkoutSnapshot({ studentId, selectedDate, data, now = Date.now() } = {}) {
  const ls = safeLocalStorage()
  const key = snapshotKey({ studentId, selectedDate })
  if (!ls || !key || !data) return false

  // Un snapshot a la vez: barrer los demás antes de escribir.
  dropAllSnapshots(ls, key)

  const finalData = trimForQuota(data)
  const envelope = JSON.stringify({ studentId, selectedDate, savedAt: now, data: finalData })
  try {
    ls.setItem(key, envelope)
    return true
  } catch {
    // Cuota llena: limpiar todos los snapshots y rendirse en silencio.
    // La revalidación igual trae los datos; sólo se pierde el pintado instantáneo.
    dropAllSnapshots(ls, null)
    return false
  }
}

// Borra todos los snapshots (ej. al cerrar sesión / cambiar de cuenta).
export function clearWorkoutSnapshots() {
  const ls = safeLocalStorage()
  if (!ls) return
  dropAllSnapshots(ls, null)
}
