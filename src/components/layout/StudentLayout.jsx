import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Home, Dumbbell, BarChart2, Clock, User } from 'lucide-react'
import NotificationBell from '../notifications/NotificationBell'

const navItems = [
  { to: '/student', label: 'Inicio', icon: Home, end: true },
  { to: '/student/workout', label: 'Hoy', icon: Dumbbell },
  { to: '/student/progress', label: 'Progreso', icon: BarChart2 },
  { to: '/student/history', label: 'Historial', icon: Clock },
  { to: '/student/profile', label: 'Perfil', icon: User },
]

export default function StudentLayout() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header con campana ─────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-100
                         flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center">
            <Dumbbell className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">GymCoach</span>
        </div>
        <NotificationBell userId={profile?.id} theme="light" />
      </header>

      {/* Main content (ajustado por el header fijo) */}
      <main className="flex-1 pb-20 pt-14">
        <Outlet />
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 safe-area-inset-bottom">
        <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0 ${
                  isActive
                    ? 'text-primary-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="text-xs font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
