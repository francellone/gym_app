// ============================================================
// RouteMemory.jsx — recuerda la última pantalla y la restaura al
// reabrir la app (opción A).
// ------------------------------------------------------------
// Vive dentro del <BrowserRouter> y del <AuthProvider>. No pinta
// nada (retorna null): solo escucha la navegación.
//
//   - Guarda la ruta profunda actual en cada navegación.
//   - Al arrancar la app (una sola vez), si caímos en el inicio,
//     salta a la última pantalla guardada del usuario.
//   - Si el usuario vuelve al inicio a propósito, limpia la memoria
//     para que la próxima apertura arranque neutral.
//
// La lógica de decisión vive en lastRoute.js (helpers puros y
// testeados); acá solo cableamos react-router + auth.
// ============================================================
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  saveLastRoute,
  clearLastRoute,
  computeRestoreTarget,
  isRestorablePath,
} from '@/features/navigation/lastRoute'

export default function RouteMemory() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()

  // Intentamos restaurar UNA sola vez, al arranque. Si no, cada vez que
  // el usuario toca "Inicio" lo rebotaríamos a la última pantalla
  // profunda — molesto e incorrecto.
  const didAttemptRestore = useRef(false)

  const userId = user?.id
  const role = profile?.role
  const path = location.pathname + location.search

  // ── Restaurar (una vez, cuando auth queda listo) ─────────────
  useEffect(() => {
    if (loading || !userId || !role) return
    if (didAttemptRestore.current) return
    didAttemptRestore.current = true

    const target = computeRestoreTarget({ currentPath: path, role, userId })
    if (target) navigate(target, { replace: true })
    // Depende solo de que auth quede listo; el resto se lee al vuelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, role])

  // ── Guardar ruta profunda / limpiar al volver al inicio ──────
  useEffect(() => {
    if (loading || !userId) return
    if (isRestorablePath(path)) {
      saveLastRoute({ userId, path })
    } else if (didAttemptRestore.current) {
      // Volvió a una landing (inicio/login) a propósito, después del
      // arranque: la próxima apertura debe ser neutral.
      clearLastRoute({ userId })
    }
  }, [loading, userId, path])

  return null
}
