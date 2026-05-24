import { useEffect, useRef, useState } from 'react'
import {
  readDraft,
  writeDraft,
  removeDraft,
  isDraftExpired,
  DEFAULT_TTL_MS,
} from '../draftStorage'

// ============================================================
// useLocalStorageDraft — F4 (doc 23, Opción A)
// ------------------------------------------------------------
// Persiste un objeto `value` en localStorage bajo `key`, debounced.
// Al mount restaura el último draft no expirado y lo entrega via
// `onRestore(payload, savedAtIso)`. Expone `clearDraft()` para
// borrar manualmente (típicamente tras un save exitoso).
//
// Decisiones (ver doc 23 §4):
//   - Debounce 400ms: agresivo lo suficiente para no perder lo que
//     el alumno tipea antes de bloquear pantalla, suave para no
//     escribir 1 vez por keystroke.
//   - TTL default 8h: cubre interrupciones realistas durante una
//     sesión, descarta drafts de días anteriores.
//   - `enabled=false`: noop completo. El padre lo apaga cuando el
//     log ya está completed (no queremos sobreescribir un log real
//     con un draft viejo).
//   - Storage default: window.localStorage. Inyectable para tests.
//   - Errores: silenciosos. Si Safari privado o cuota llena, la UI
//     no se rompe — el alumno queda con el comportamiento actual.
//
// Limitaciones conocidas (V1):
//   - No usa `BroadcastChannel` ni el `storage` event entre tabs.
//     Si el alumno tiene 2 tabs con el mismo card, gana la última
//     escritura. Caso de uso esperado: 1 sola tab en mobile.
//   - No fuerza flush en `beforeunload`. Si el alumno cierra dentro
//     de los 400ms post-último-onChange, potencialmente pierde lo
//     último tipeado. Ver doc 23 §9 P1.3.
// ============================================================

export default function useLocalStorageDraft({
  key,
  value,
  enabled = true,
  ttlMs = DEFAULT_TTL_MS,
  debounceMs = 400,
  storage,
  onRestore,
}) {
  // Estado mínimo expuesto al consumer: tracking de restore.
  // `restoredAt` es null si no hubo restore (key vacía, expirado, deshabilitado).
  const [restoredAt, setRestoredAt] = useState(null)

  // Refs para evitar re-corridas del effect de restore + manejar timers.
  const didRestoreRef = useRef(false)
  const timerRef = useRef(null)
  // Onmount de la key actual: si la key cambia, permitimos re-restore.
  const lastRestoredKeyRef = useRef(null)

  // ── 1) Restore al mount (o al cambiar la key) ─────────────
  useEffect(() => {
    if (!enabled || !key) {
      didRestoreRef.current = false
      lastRestoredKeyRef.current = null
      setRestoredAt(null)
      return
    }
    if (lastRestoredKeyRef.current === key) return // ya restauramos esta key

    const env = readDraft(key, storage)
    lastRestoredKeyRef.current = key
    didRestoreRef.current = true

    if (!env) {
      setRestoredAt(null)
      return
    }
    if (isDraftExpired(env.savedAt, ttlMs)) {
      // Cleanup oportunista: borrar el expirado para no acumular basura.
      removeDraft(key, storage)
      setRestoredAt(null)
      return
    }

    // Restore válido. Notificar al consumer y registrar el savedAt
    // para que el padre pueda mostrar el hint "Recuperamos ...".
    setRestoredAt(env.savedAt)
    if (typeof onRestore === 'function') {
      try {
        onRestore(env.payload, env.savedAt)
      } catch {
        // Si el callback rompe, no contaminamos el flujo. El draft ya
        // se "consumió" desde el punto de vista de la UI.
      }
    }
    // onRestore no va en deps a propósito: queremos correr esto exactamente
    // una vez por (key, enabled). Si el padre cambia onRestore entre renders,
    // no debería re-disparar restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, storage, ttlMs])

  // ── 2) Write debounced al cambiar value ───────────────────
  useEffect(() => {
    if (!enabled || !key) return
    // Esperamos a que el restore inicial haya corrido para no escribir
    // el value default antes de leer el draft existente. Si didRestoreRef
    // sigue en false, salimos sin programar timer.
    if (!didRestoreRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      writeDraft(key, value, storage)
      timerRef.current = null
    }, debounceMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [value, key, enabled, debounceMs, storage])

  // ── 3) clearDraft expuesto al consumer ────────────────────
  function clearDraft() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (key) removeDraft(key, storage)
    setRestoredAt(null)
  }

  return { restoredAt, clearDraft }
}
