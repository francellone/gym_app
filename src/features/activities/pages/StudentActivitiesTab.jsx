import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays } from 'date-fns'
import { useAuth } from '@/features/auth/AuthContext'
import { listActivities, getActivityTypeMeta } from '../api'
import DayActivitiesCard from '../components/DayActivitiesCard'

// ============================================================
// StudentActivitiesTab — vista coach de actividades extra
// ------------------------------------------------------------
// El coach carga actividades en cualquier fecha (DayActivitiesCard
// con source='coach') y ve el historial reciente agrupado por día.
// Montado en StudentDetailPage como tab "Actividad".
// ============================================================
export default function StudentActivitiesTab({ studentId }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  const loadRecent = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    const from = format(subDays(new Date(), 60), 'yyyy-MM-dd')
    const { data } = await listActivities(studentId, { from })
    setRecent(data)
    setLoading(false)
  }, [studentId])

  useEffect(() => {
    loadRecent()
  }, [loadRecent, date])

  // Agrupa por fecha desc para el historial.
  const byDate = useMemo(() => {
    const map = new Map()
    for (const a of recent) {
      if (!map.has(a.date)) map.set(a.date, [])
      map.get(a.date).push(a)
    }
    return [...map.entries()]
  }, [recent])

  return (
    <div className="space-y-5">
      {/* Carga en una fecha puntual */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
          {t('activities.coach.pickDate')}
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
        />
      </div>

      <DayActivitiesCard
        key={date}
        studentId={studentId}
        userId={profile?.id}
        date={date}
        source="coach"
        canEdit={true}
        onChange={loadRecent}
      />

      {/* Historial reciente */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          {t('activities.coach.recentTitle')}
        </h4>
        {loading ? (
          <p className="text-xs text-gray-400">{t('common.loading')}</p>
        ) : byDate.length === 0 ? (
          <p className="text-xs text-gray-400">{t('activities.coach.recentEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {byDate.map(([d, list]) => (
              <div key={d} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">{d}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((a) => {
                    const meta = getActivityTypeMeta(a.activity_type)
                    const name = a.label || (meta ? t(meta.i18n) : a.activity_type)
                    const dur = a.duration_min != null ? ` · ${a.duration_min}′` : ''
                    const into = a.intensity != null ? ` · ${a.intensity}/10` : ''
                    return (
                      <span
                        key={a.id}
                        title={a.notes || ''}
                        className="text-[11px] font-medium px-2 py-1 rounded-full bg-white border border-sky-100 text-gray-700"
                      >
                        {meta?.emoji || '✨'} {name}
                        {dur}
                        {into}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
