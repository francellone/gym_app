import { useRef, useState } from 'react'
import { buildErrorBanner } from '@/utils/errorHelpers'

// Hook para banner de error de save con timer de auto-cierre.
// Extraído de TodayWorkoutPage el 2026-05-21 (Tier 2.3 batch 3).
//
// El banner cubre el bug histórico donde un fallo de save (RPC rechazada,
// CHECK constraint, etc.) quedaba como console.error silencioso y el alumno
// pensaba haber guardado cuando el back rechazó la operación.
//
// Devuelve `{ banner, show, dismiss }`:
//   - banner: { message, persistent } | null
//   - show(arg, errOverride?): tres formas de uso
//     - show(error)                  → infiere todo del error
//     - show('mensaje custom')       → mensaje fijo, recuperable (auto-cierra)
//     - show('mensaje custom', err)  → mensaje fijo, persistencia inferida del error
//   - dismiss(): cierra el banner manualmente
//
// Los banners no-persistentes se cierran solos a los ~6s.
// Si aparece un segundo consumidor fuera de workouts, promover a `src/utils/`.
export default function useSaveErrorBanner() {
  const [banner, setBanner] = useState(null)
  const timerRef = useRef(null)

  function show(arg, errOverride) {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    let next
    if (arg && typeof arg === 'object') {
      // Caso 1: nos pasaron el error directo
      next = buildErrorBanner(arg)
    } else {
      // Caso 2 y 3: mensaje custom (opcionalmente con error para inferir persistencia)
      next = buildErrorBanner(errOverride || null, arg)
    }
    setBanner(next)
    if (!next.persistent) {
      timerRef.current = setTimeout(() => setBanner(null), 6000)
    }
  }

  function dismiss() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setBanner(null)
  }

  return { banner, show, dismiss }
}
