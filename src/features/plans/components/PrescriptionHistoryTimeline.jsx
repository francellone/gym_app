import { ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { PRESCRIPTION_FIELD_KEYS, PRESCRIPTION_FIELD_LABELS_ES } from '../prescriptionHistory'

// ============================================================
// PrescriptionHistoryTimeline (doc 48)
// ------------------------------------------------------------
// Lista de cambios de prescripción de un ejercicio (más reciente arriba).
// Reutilizable en coach (labels ES) y alumna (labels vía i18n).
//
// Props:
//   entries  [{ changed_at, changes: {fieldKey:{old,new}}, note }]
//   labels   mapa fieldKey → etiqueta (default español)
//   dateFmt  formato date-fns (default 'dd MMM yyyy')
// ============================================================
export default function PrescriptionHistoryTimeline({
  entries = [],
  labels = PRESCRIPTION_FIELD_LABELS_ES,
  dateFmt = 'dd MMM yyyy',
}) {
  if (!entries || entries.length === 0) return null

  return (
    <ol className="space-y-2">
      {entries.map((e) => {
        const keys = PRESCRIPTION_FIELD_KEYS.filter((k) => e.changes && e.changes[k])
        return (
          <li key={e.id} className="relative pl-4">
            <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <div className="text-[11px] text-gray-400 font-medium">
              {e.changed_at ? format(new Date(e.changed_at), dateFmt) : ''}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {keys.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-gray-700"
                >
                  <span className="text-gray-400">{labels[k]}</span>
                  <span className="text-gray-500 line-through">{e.changes[k].old}</span>
                  <ArrowRight size={10} className="text-emerald-500" />
                  <span className="text-emerald-700 font-semibold">{e.changes[k].new}</span>
                </span>
              ))}
            </div>
            {e.note && <p className="mt-1 text-xs text-gray-600 italic">"{e.note}"</p>}
          </li>
        )
      })}
    </ol>
  )
}
