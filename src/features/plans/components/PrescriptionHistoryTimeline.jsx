import { ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '@/i18n/dateLocale'
import { PRESCRIPTION_FIELD_KEYS } from '../prescriptionHistory'

// ============================================================
// PrescriptionHistoryTimeline (doc 48)
// ------------------------------------------------------------
// Lista de cambios de prescripción de un ejercicio (más reciente arriba).
// Reutilizable en coach y alumna: por defecto usa las etiquetas del panel
// de la coach (coach.planEditor.prescriptionFields.*) en el idioma activo.
//
// Props:
//   entries  [{ changed_at, changes: {fieldKey:{old,new}}, note }]
//   labels   mapa fieldKey → etiqueta (default: claves del panel de la coach)
//   dateFmt  formato date-fns (default: coach.planEditor.prescriptionTimeline.dateFormat)
// ============================================================
export default function PrescriptionHistoryTimeline({ entries = [], labels, dateFmt }) {
  const { t } = useTranslation()
  if (!entries || entries.length === 0) return null
  const fmt = dateFmt || t('coach.planEditor.prescriptionTimeline.dateFormat')
  const labelOf = (k) => (labels ? labels[k] : t(`coach.planEditor.prescriptionFields.${k}`))

  return (
    <ol className="space-y-2">
      {entries.map((e) => {
        const keys = PRESCRIPTION_FIELD_KEYS.filter((k) => e.changes && e.changes[k])
        return (
          <li key={e.id} className="relative pl-4">
            <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <div className="text-[11px] text-gray-400 font-medium">
              {e.changed_at ? format(new Date(e.changed_at), fmt, { locale: dateLocale() }) : ''}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {keys.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-gray-700"
                >
                  <span className="text-gray-400">{labelOf(k)}</span>
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
