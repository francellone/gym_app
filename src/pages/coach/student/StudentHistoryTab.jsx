import { History, Edit2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { FIELD_LABELS } from '../../../utils/studentHelpers'

// ─────────────────────────────────────────────────────────────
// StudentHistoryTab — historial de modificaciones del perfil
// Props: editHistory
// ─────────────────────────────────────────────────────────────
export default function StudentHistoryTab({ editHistory }) {
  if (editHistory.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-900">Historial de modificaciones</h3>
        </div>
        <div className="card text-center py-8 text-gray-400">
          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin modificaciones registradas</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History size={16} className="text-gray-500" />
        <h3 className="font-semibold text-gray-900">Historial de modificaciones</h3>
      </div>
      <div className="space-y-2">
        {editHistory.map(h => (
          <div key={h.id} className="card">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Edit2 size={13} className="text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {FIELD_LABELS[h.field_name] || h.field_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="text-red-500 line-through">{h.old_value || '—'}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-medium">{h.new_value || '—'}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 flex-shrink-0">
                {format(parseISO(h.changed_at), 'd/MM/yy HH:mm')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
