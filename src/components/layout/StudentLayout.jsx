import { Outlet, NavLink } from 'react-router-dom'
import { Home, Dumbbell, BarChart2, Clock, User, Sun, Moon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

const navItems = [
  { to: '/student', label: 'Inicio', icon: Home, end: true },
  { to: '/student/workout', label: 'Hoy', icon: Dumbbell },
  { to: '/student/progress', label: 'Progreso', icon: BarChart2 },
  { to: '/student/history', label: 'Historial', icon: Clock },
  { to: '/student/profile', label: 'Perfil', icon: User },
]

export default function StudentLayout() {
  const { dark, toggleDark } = useTheme()

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0d1117] flex flex-col transition-colors duration-200">
      {/* Main content */}
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#161b27] border-t border-gray-200 dark:border-[#252e42] safe-area-inset-bottom transition-colors duration-200">
        <div className="flex items-center justify-around px-1 pt-2 pb-3 max-w-lg mx-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-0 ${
                  isActive ? 'text-primary-500' : 'text-gray-400 dark:text-[#4a5568]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={21} strokeWidth={isActive ? 2.3 : 1.7} />
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Dark mode toggle — dentro de la nav como ítem extra */}
          <button
            onClick={toggleDark}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-gray-400 dark:text-[#4a5568] hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={dark ? 'Modo claro' : 'Modo oscuro'}
          >
            {dark
              ? <Sun size={21} strokeWidth={1.7} />
              : <Moon size={21} strokeWidth={1.7} />
            }
            <span className="text-[10px] font-semibold">{dark ? 'Claro' : 'Oscuro'}</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
