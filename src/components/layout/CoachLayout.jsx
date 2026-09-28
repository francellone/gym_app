import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Dumbbell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  BarChart2,
  FileText,
  MessageSquare,
} from 'lucide-react'
import { useState } from 'react'
import NotificationBell from '@/features/notifications/components/NotificationBell'
import IosInstallBanner from '@/components/IosInstallBanner'
import { useTranslation } from 'react-i18next'
import AvatarImage from '@/features/avatars/AvatarImage'

const navItems = [
  { to: '/coach', labelKey: 'coach.layout.nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/coach/students', labelKey: 'coach.layout.nav.students', icon: Users },
  { to: '/coach/plans', labelKey: 'coach.layout.nav.plans', icon: ClipboardList },
  { to: '/coach/exercises', labelKey: 'coach.layout.nav.exercises', icon: Dumbbell },
  { to: '/coach/evaluations', labelKey: 'coach.layout.nav.evaluations', icon: BarChart2 },
  { to: '/coach/form-builder', labelKey: 'coach.layout.nav.intakeForm', icon: FileText },
  { to: '/coach/follow-up-forms', labelKey: 'coach.layout.nav.followUp', icon: MessageSquare },
]

export default function CoachLayout() {
  const { profile, signOut } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-fondo flex">
      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 fixed inset-y-0 bg-white border-r border-linea">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-linea">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-tinta text-sm">GymCoach</p>
            <p className="text-[11px] text-texto2">{t('coach.layout.panelSubtitle')}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-durazno-50 text-primary-700'
                    : 'text-texto2 hover:bg-durazno-50/60 hover:text-tinta'
                }`
              }
            >
              <item.icon size={15} strokeWidth={1.8} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* Notifications + User */}
        <div className="px-2.5 py-3 border-t border-linea">
          {/* Campana en sidebar desktop */}
          <div className="flex items-center justify-between px-3 py-1.5 mb-1">
            <span className="text-xs text-texto2 font-medium">
              {t('coach.layout.notifications')}
            </span>
            <NotificationBell userId={profile?.id} theme="light" placement="right" />
          </div>
          <Link
            to="/coach/profile"
            title={t('coach.layout.myProfile')}
            className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg hover:bg-durazno-50/60 transition-colors"
          >
            <div className="w-7 h-7 bg-durazno-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <AvatarImage path={profile?.avatar_url} alt={profile?.name}>
                <span className="text-primary-700 font-semibold text-xs">
                  {profile?.name?.[0]?.toUpperCase() || 'C'}
                </span>
              </AvatarImage>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-tinta truncate">{profile?.name}</p>
              <p className="text-[11px] text-texto2">{t('coach.layout.myProfile')}</p>
            </div>
            <ChevronRight size={13} className="text-texto3 flex-shrink-0" />
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-texto2 hover:text-red-700 hover:bg-red-100 transition-colors"
          >
            <LogOut size={13} />
            {t('coach.layout.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Mobile header ─────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-linea px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <Dumbbell className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-tinta text-sm">GymCoach</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell userId={profile?.id} theme="light" />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-texto2 hover:bg-durazno-50 transition-colors"
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-gray-900/40"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-64 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-16 pb-4 px-3">
              <Link
                to="/coach/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 mb-5 px-3 py-2.5 bg-durazno-50 rounded-xl"
              >
                <div className="w-9 h-9 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                  <AvatarImage path={profile?.avatar_url} alt={profile?.name}>
                    <span className="text-primary-700 font-semibold text-xs">
                      {profile?.name?.[0]?.toUpperCase() || 'C'}
                    </span>
                  </AvatarImage>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-tinta break-words">{profile?.name}</p>
                  <p className="text-[11px] text-texto2">{t('coach.layout.myProfile')}</p>
                </div>
                <ChevronRight size={14} className="text-texto3 flex-shrink-0" />
              </Link>

              <nav className="space-y-0.5">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-durazno-50 text-primary-700'
                          : 'text-texto2 hover:bg-durazno-50/60 hover:text-tinta'
                      }`
                    }
                  >
                    <item.icon size={16} strokeWidth={1.8} />
                    {t(item.labelKey)}
                    <ChevronRight size={14} className="ml-auto text-texto3" />
                  </NavLink>
                ))}
              </nav>

              <button
                onClick={handleSignOut}
                className="mt-4 w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm text-texto2 hover:text-red-700 hover:bg-red-100 transition-colors"
              >
                <LogOut size={16} />
                {t('coach.layout.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de instalación en iOS */}
      <IosInstallBanner />

      {/* ── Main content ──────────────────────────────────── */}
      <main className="flex-1 lg:ml-56 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
