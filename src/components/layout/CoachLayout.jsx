import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard, Users, ClipboardList, Dumbbell,
  LogOut, Menu, X, ChevronRight, BarChart2, FileText
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/coach', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/coach/students', label: 'Alumnos', icon: Users },
  { to: '/coach/plans', label: 'Planes', icon: ClipboardList },
  { to: '/coach/exercises', label: 'Ejercicios', icon: Dumbbell },
  { to: '/coach/evaluations', label: 'Evaluaciones', icon: BarChart2 },
  { to: '/coach/form-builder', label: 'Formulario', icon: FileText },
]

export default function CoachLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 fixed inset-y-0 bg-[#18202e] border-r border-[#252e42]">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-[#252e42]">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-100 text-sm">GymCoach</p>
            <p className="text-[11px] text-slate-500">Panel Coach</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-4 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <item.icon size={15} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-2.5 py-3 border-t border-[#252e42]">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-7 h-7 bg-primary-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-primary-400 font-semibold text-xs">
                {profile?.name?.[0]?.toUpperCase() || 'C'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{profile?.name}</p>
              <p className="text-[11px] text-slate-500">Coach</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile header ─────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-[#18202e] border-b border-[#252e42] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center">
            <Dumbbell className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-slate-100 text-sm">GymCoach</span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-lg text-slate-400 hover:bg-white/8 transition-colors"
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute right-0 top-0 h-full w-64 bg-[#18202e] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-16 pb-4 px-3">
              <div className="flex items-center gap-2.5 mb-5 px-3 py-2.5 bg-white/5 rounded-xl">
                <div className="w-7 h-7 bg-primary-500/20 rounded-full flex items-center justify-center">
                  <span className="text-primary-400 font-semibold text-xs">
                    {profile?.name?.[0]?.toUpperCase() || 'C'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">{profile?.name}</p>
                  <p className="text-[11px] text-slate-500">Coach</p>
                </div>
              </div>

              <nav className="space-y-0.5">
                {navItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-500/15 text-primary-400'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`
                    }
                  >
                    <item.icon size={16} strokeWidth={1.8} />
                    {item.label}
                    <ChevronRight size={14} className="ml-auto text-slate-600" />
                  </NavLink>
                ))}
              </nav>

              <button
                onClick={handleSignOut}
                className="mt-4 w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/8 transition-colors"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────── */}
      <main className="flex-1 lg:ml-56 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
