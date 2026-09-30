import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isSelfCoached } from '../api'

// El armador y el registro libre son de la persona sin coach (decisión de
// producto 2026-09-29). Con coach, el plan lo arma la coach.
// allowCoach=false: la pantalla es solo para personas (p. ej. buscar coach).
export default function SelfCoachedOnly({ children, allowCoach = true }) {
  const { profile } = useAuth()
  if (!isSelfCoached(profile)) return <Navigate to="/student" replace />
  if (!allowCoach && profile?.role === 'coach') return <Navigate to="/student" replace />
  return <div className="px-4 py-4">{children}</div>
}
