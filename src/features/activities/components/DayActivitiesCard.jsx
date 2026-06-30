import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Clock, Flame } from 'lucide-react'
import {
  listActivitiesForDay,
  createActivity,
  updateActivity,
  deleteActivity,
  buildActivityPayload,
  getActivityTypeMeta,
} from '../api'
import ActivityModal from './ActivityModal'

// ============================================================
// DayActivitiesCard — actividades extra de un día (self-contained)
// ------------------------------------------------------------
// Lista las actividades no vinculadas al entrenamiento de un alumno
// en una fecha, y permite agregar/editar/borrar. Se muestra tanto en
// días de entreno como de descanso (NO depende de workout_session).
//
// Reutilizable: alumno (source='student') y coach (source='coach',
// studentId del alumno seleccionado). La RLS define qué puede tocar.
// ============================================================
export default function DayActivitiesCard({
  studentId,
  userId,
  date,
  source = 'student',
  canEdit = true,
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!studentId || !date) return
    setLoading(true)
    const { data } = await listActivitiesForDay(studentId, date)
    setItems(data)
    setLoading(false)
  }, [studentId, date])

  useEffect(() => {
    load()
  }, [load])

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(item) {
    setEditing(item)
    setModalOpen(true)
  }

  async function handleSave(draft) {
    setSaving(true)
    if (editing) {
      await updateActivity(editing.id, {
        activity_type: draft.activity_type,
        label: draft.label || null,
        duration_min: draft.duration_min === '' ? null : Number(draft.duration_min),
        intensity: draft.intensity === '' ? null : Number(draft.intensity),
        notes: draft.notes || null,
      })
    } else {
      const payload = buildActivityPayload({ draft, studentId, userId, date, source })
      await createActivity(payload)
    }
    setSaving(false)
    setModalOpen(false)
    setEditing(null)
    load()
  }

  async function handleDelete(item) {
    if (!window.confirm(t('activities.confirmDelete'))) return
    await deleteActivity(item.id)
    load()
  }

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏅</span>
          <p className="font-semibold text-sm text-gray-900">{t('activities.cardTitle')}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
          >
            <Plus size={14} /> {t('activities.add')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-sky-700/80">{t('activities.emptyDay')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const meta = getActivityTypeMeta(item.activity_type)
            const name = item.label || (meta ? t(meta.i18n) : item.activity_type)
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl bg-white border border-sky-100 px-3 py-2"
              >
                <span className="text-base">{meta?.emoji || '✨'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    {item.duration_min != null && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={11} /> {t('activities.minutes', { value: item.duration_min })}
                      </span>
                    )}
                    {item.intensity != null && (
                      <span className="flex items-center gap-0.5">
                        <Flame size={11} /> {item.intensity}/10
                      </span>
                    )}
                    {item.source === 'coach' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {t('activities.byCoach')}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-[11px] text-gray-500 mt-0.5 italic truncate">{item.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="p-1 text-gray-400 hover:text-sky-600"
                      aria-label={t('common.edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      aria-label={t('activities.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ActivityModal
        open={modalOpen}
        initial={editing}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
