import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Home, Dumbbell, BarChart2, Clock, User, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import NotificationBell from '@/features/notifications/components/NotificationBell'
import IosInstallBanner from '@/components/IosInstallBanner'
import PendingFormsBanner from '@/features/forms/components/PendingFormsBanner'
import { useNoteThreadUnread } from '@/features/notes/hooks/useNoteThreadUnread'
import { CelebrationProvider } from '@/features/milestones/CelebrationContext'

// i18n (doc 46): labels como keys de traducción, se resuelven con t() en render
const navItems = [
  { to: '/student', label: 'nav.home', icon: Home, end: true },
  { to: '/student/workout', label: 'nav.today', icon: Dumbbell },
  { to: '/student/notes', label: 'nav.notes', icon: MessageSquare, key: 'notes' },
  { to: '/student/progress', label: 'nav.progress', icon: BarChart2 },
  { to: '/student/history', label: 'nav.history', icon: Clock },
  { to: '/student/profile', label: 'nav.profile', icon: User },
]

export default function StudentLayout() {
  const { profile } = useAuth()
  const { t } = useTranslation()
  // Badge de no-leídas en el item Notas (suscripción realtime a note_threads)
  const { count: unreadNotes } = useNoteThreadUnread(profile?.id, 'student')

  return (
    // Celebraciones de hitos (v55): la cola vive acá para que los hitos
    // pendientes aparezcan en cualquier pantalla al abrir la app.
    <CelebrationProvider studentId={profile?.id}>
      <div className="min-h-screen bg-fondo flex flex-col">
        {/* ── Header con campana ─────────────────────────────── */}
        <header
          className="fixed top-0 inset-x-0 z-40 bg-durazno-100
                         flex items-center justify-between px-4 py-2.5"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Dumbbell className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-tinta text-sm">GymCoach</span>
          </div>
          <NotificationBell userId={profile?.id} theme="light" />
        </header>

        {/* Main content (ajustado por el header fijo) */}
        <main className="flex-1 pb-28 pt-14">
          {/* Formularios pendientes: vive acá (y no en el Inicio) para que el
            alumno lo vea en cualquier pantalla. Ver PendingFormsBanner. */}
          <PendingFormsBanner studentId={profile?.id} />
          <Outlet />
        </main>

        {/* Aviso de instalación en iOS (arriba de la bottom nav) */}
        <IosInstallBanner offsetClass="bottom-24" />

        {/* Bottom nav (mobile-first) */}
        <nav
          className="fixed inset-x-3 z-40 max-w-lg mx-auto bg-white border border-linea rounded-3xl shadow-flotante"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <div className="flex items-center justify-around px-1.5 py-1.5">
            {navItems.map((item) => {
              const showBadge = item.key === 'notes' && unreadNotes > 0
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-colors min-w-0 relative ${
                      isActive ? 'bg-durazno-50 text-primary-700' : 'text-texto3 hover:text-texto2'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="relative">
                        <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                        {showBadge && (
                          <span
                            className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-primary-600
                                     text-white text-[10px] font-bold rounded-full
                                     flex items-center justify-center leading-none ring-2 ring-white"
                          >
                            {unreadNotes > 9 ? '9+' : unreadNotes}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>
    </CelebrationProvider>
  )
}
