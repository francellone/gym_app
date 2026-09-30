import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isSelfCoached } from '../api'

// El armador y el registro libre son de la persona sin coach (decisión de
// producto 2026-09-29). Con coach, el plan lo arma la coach.
export default function SelfCoachedOnly({ children }) {
  const { profile } = useAuth()
  if (!isSelfCoached(profile)) return <Navigate to="/student" replace />
  return <div className="px-4 py-4">{children}</div>
}
