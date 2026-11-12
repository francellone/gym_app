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

// ------------------------------------------------------------
// Primer arranque del día: la ESTRUCTURA del plan del último snapshot
// ------------------------------------------------------------
// El snapshot es por fecha, así que la primera apertura de cada día no tiene
// nada que pintar y espera la red (que tras un rato sin uso puede tardar
// decenas de segundos: ver memoria [[lentitud-dashboard-calendario-infra]]).
// Esta lectura devuelve, del snapshot más reciente de ESTA persona (cualquier
// fecha, hasta 7 días), solo lo que no depende del día: plan, ejercicios y
// bloques. NUNCA registros, sesión ni bienestar: nada de otro día puede
// aparecer como hecho hoy. La página lo pinta en solo lectura hasta que
// fetchWorkout confirma el plan vigente.
//
// `dayHints` son pares {logged_date, plan_exercise_id} del snapshot: sirven
// solo para adivinar qué día toca mostrar mientras tanto; no se muestran.
const STALE_PLAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

export function readStalePlanSnapshot({ studentId, now = Date.now() } = {}) {
  const ls = safeLocalStorage()
  if (!ls || !studentId) return null
  const prefix = `${KEY_PREFIX}${studentId}:`
  let best = null
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (!k || !k.startsWith(prefix)) continue
      let env = null
      try {
        env = JSON.parse(ls.getItem(k))
      } catch {
        continue
      }
      if (!env || env.studentId !== studentId || typeof env.savedAt !== 'number') continue
      if (now - env.savedAt > STALE_PLAN_MAX_AGE_MS) continue
      const d = env.data
      if (!d?.assignment?.plan_id || !Array.isArray(d.planExercises)) continue
      if (d.planExercises.length === 0) continue
      if (!best || env.savedAt > best.savedAt) best = env
    }
  } catch {
    return null
  }
  if (!best) return null
  const d = best.data
  const dayHints = [...(d.recentLogs || []), ...Object.values(d.logs || {})]
    .filter((l) => l && l.logged_date && l.plan_exercise_id)
    .map((l) => ({ logged_date: l.logged_date, plan_exercise_id: l.plan_exercise_id }))
  return {
    fromDate: best.selectedDate,
    savedAt: best.savedAt,
    studentName: d.studentName ?? '',
    assignment: d.assignment,
    planExercises: d.planExercises,
    planBlocks: Array.isArray(d.planBlocks) ? d.planBlocks : [],
    threadId: d.threadId ?? null,
    dayHints,
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
