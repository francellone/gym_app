import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ClipboardList, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ============================================================
// UpcomingEvaluations
// ------------------------------------------------------------
// Fase C.3 (doc 19). Lista compacta de las próximas evaluaciones
// asignadas. Si el filtro global tiene un alumno seleccionado, se
// filtra a ese alumno; sino muestra las más próximas globalmente.
//
// Criterio de "próxima":
//   - plan_type = 'evaluation'
//   - status != 'archived' && status != 'completed' && status != 'replaced'
//   - start_date >= hoy (si start_date null, se interpreta como "sin fecha"
//     y se muestra como tal)
//
// Props:
//   filterStudentId  uuid | null
//   limit            number (default 5)
// ============================================================

const DEFAULT_LIMIT = 5

export default function UpcomingEvaluations({
  filterStudentId = null,
  limit = DEFAULT_LIMIT,
  className = '',
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const today = format(new Date(), 'yyyy-MM-dd')
        let q = supabase
          .from('plan_assignments')
          .select(
            'id, student_id, plan_id, start_date, end_date, status, plan_type, plan:plans!plan_id(title, eval_type, plan_type), student:profiles!student_id(id, name, active)'
          )
          .eq('plan_type', 'evaluation')
          .not('status', 'in', '("archived","completed","replaced")')
          .order('start_date', { ascending: true, nullsFirst: false })
          .limit(limit * 4) // overfetch para filtrar localmente cosas opcionales

        if (filterStudentId) q = q.eq('student_id', filterStudentId)

        const { data, error } = await q
        if (error) throw error
        if (cancelled) return

        const filtered = (data || [])
          .filter((a) => a.student?.active)
          .filter((a) => {
            // Si no tiene start_date, lo incluimos (sin fecha → mostrar como "Sin fecha")
            if (!a.start_date) return true
            return String(a.start_date).slice(0, 10) >= today
          })
          .slice(0, limit)

        setItems(filtered)
      } catch (err) {
        console.error('[UpcomingEvaluations] load', err)
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [filterStudentId, limit])

  if (loading) {
    return (
      <div className={`card ${className}`}>
        <p className="text-xs text-gray-400 italic">Cargando evaluaciones…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={`card text-center py-6 ${className}`}>
        <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No hay evaluaciones próximas</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((a) => (
        <Link
          key={a.id}
          to={`/coach/students/${a.student_id}?tab=evaluaciones`}
          className="card flex items-center gap-3 hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ClipboardList size={18} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {a.plan?.title || 'Evaluación'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {a.student?.name}
              {a.start_date
                ? ` · ${format(parseISO(a.start_date), "d 'de' MMMM", { locale: es })}`
                : ' · Sin fecha asignada'}
            </p>
          </div>
          <span className="badge bg-purple-100 text-purple-700 text-xs flex-shrink-0">
            Pendiente
          </span>
          <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
        </Link>
      ))}
    </div>
  )
}
