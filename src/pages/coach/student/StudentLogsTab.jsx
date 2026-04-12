import { Activity } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────
// StudentLogsTab — visualización de logs recientes del alumno
// Props: logs
// ─────────────────────────────────────────────────────────────
export default function StudentLogsTab({ logs }) {
  if (logs.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Sin registros aún</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log.id} className="card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-gray-900 truncate">
                  {log.plan_exercise?.exercise?.name || 'Ejercicio'}
                </p>
                {log.logged_late && (
                  <span className="badge bg-orange-100 text-orange-600 text-xs">Registrado tarde</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {[
                  log.actual_sets && `${log.actual_sets} series`,
                  log.actual_reps && `${log.actual_reps} reps`,
                  log.actual_weight && `${log.actual_weight}kg`,
                ].filter(Boolean).join(' · ')}
              </p>
              {log.notes && (
                <p className="text-xs text-gray-400 mt-1 italic truncate">"{log.notes}"</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">
                {format(parseISO(log.logged_date), 'dd/MM/yy')}
              </p>
              {log.perceived_difficulty && (
                <span className={`badge mt-1 ${
                  log.perceived_difficulty >= 8 ? 'bg-red-100 text-red-700' :
                  log.perceived_difficulty >= 5 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  PSE {log.perceived_difficulty}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
