import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Search, ChevronRight, TrendingUp } from 'lucide-react'

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchStudents()
  }, [])

  async function fetchStudents() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          plan_assignments(
            id, active,
            plan:plans!plan_id(title)
          )
        `)
        .eq('role', 'student')
        .order('name')

      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = students.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  )

  const levelColor = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  }
  const levelLabel = {
    beginner: 'Principiante',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alumnos</h1>
          <p className="text-sm text-gray-500">{students.length} registrados</p>
        </div>
        <Link to="/coach/students/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo alumno</span>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Buscar alumno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay alumnos</p>
          <p className="text-gray-400 text-sm mt-1">
            {search ? 'Ningún resultado para tu búsqueda' : 'Creá tu primer alumno'}
          </p>
          {!search && (
            <Link to="/coach/students/new" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus size={16} />
              Agregar alumno
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(student => {
            const activePlan = student.plan_assignments?.find(a => a.active)
            const initials = student.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

            return (
              <Link
                key={student.id}
                to={`/coach/students/${student.id}`}
                className="card hover:shadow-md transition-all flex items-center gap-3 active:scale-[0.98]"
              >
                {/* Avatar */}
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">{initials}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                    {student.level && (
                      <span className={`badge ${levelColor[student.level]}`}>
                        {levelLabel[student.level]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {activePlan ? activePlan.plan?.title : 'Sin plan asignado'}
                  </p>
                </div>

                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
