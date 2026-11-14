import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { homePathFor } from '@/features/auth/authLinks'
import { resolveNotificationDestination } from '../utils/resolveNotificationDestination'

// /n/:id — destino de los avisos al celular (v81).
// El push solo lleva el id del aviso; el lugar al que hay que ir lo decide
// acá la MISMA función que usa la campana (getNotificationTargetUrl), así no
// hay un segundo mapeo de destinos que mantener en el service worker.
// Si el aviso no existe, no es de esta persona o tarda demasiado: al inicio.

const LOOKUP_TIMEOUT_MS = 6000

export default function NotificationRedirectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, profileMissing } = useAuth()

  useEffect(() => {
    let alive = true
    const home = homePathFor(profile, profileMissing)
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS))

    Promise.race([resolveNotificationDestination(id).catch(() => null), timeout]).then((target) => {
      if (alive) navigate(target || home, { replace: true })
    })

    return () => {
      alive = false
    }
    // Solo depende del aviso pedido; el perfil se lee al vuelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
