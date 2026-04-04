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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-100 fixed inset-y-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6 border-b border-gray-100">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900">GymCoach</p>
            <p className="text-xs text-gray-500">Panel Coach</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-700 font-semibold text-sm">
                {profile?.name?.[0]?.toUpperCase() || 'C'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name}</p>
              <p className="text-xs text-gray-500">Coach</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-ghost w-full flex items-center gap-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">GymCoach</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg hover:bg-gray-100">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMenuOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="pt-16 pb-4 px-4">
              <div className="flex items-center gap-3 mb-6 px-3 py-2 bg-gray-50 rounded-xl">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-sm">
                    {profile?.name?.[0]?.toUpperCase() || 'C'}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{profile?.name}</p>
                  <p className="text-xs text-gray-500">Coach</p>
                </div>
              </div>

              <nav className="space-y-1">
                {navItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                    <ChevronRight size={16} className="ml-auto text-gray-400" />
                  </NavLink>
                ))}
              </nav>

              <button
                onClick={handleSignOut}
                className="mt-4 w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut size={18} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
