import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { ACTIVITY_TYPES, requiresLabel, validateActivityDraft } from '../api'

// ============================================================
// ActivityModal — alta/edición de una actividad extra del día
// ------------------------------------------------------------
// Controlado por el padre (DayActivitiesCard). `initial` null = alta;
// con datos = edición. Llama onSave(draft) sólo si valida. No toca
// Supabase: la persistencia la maneja el padre.
// ============================================================
const EMPTY = { activity_type: '', label: '', duration_min: '', intensity: '', notes: '' }

export default function ActivityModal({ open, initial, onSave, onClose, saving }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(EMPTY)
  const [errorKey, setErrorKey] = useState(null)

  useEffect(() => {
    if (open) {
      setDraft(
        initial
          ? {
              activity_type: initial.activity_type || '',
              label: initial.label || '',
              duration_min: initial.duration_min ?? '',
              intensity: initial.intensity ?? '',
              notes: initial.notes || '',
            }
          : EMPTY
      )
      setErrorKey(null)
    }
  }, [open, initial])

  if (!open) return null

  function set(k, v) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  function handleSave() {
    const err = validateActivityDraft(draft)
    if (err) {
      setErrorKey(err)
      return
    }
    onSave(draft)
  }

  const showLabel = requiresLabel(draft.activity_type)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            {initial ? t('activities.editTitle') : t('activities.addTitle')}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Tipo */}
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
          {t('activities.fields.type')}
        </label>
        <div className="flex flex-wrap gap-2 mb-4">
          {ACTIVITY_TYPES.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set('activity_type', opt.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border-2 transition-all ${
                draft.activity_type === opt.key
                  ? 'border-sky-400 bg-sky-50 text-sky-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.emoji} {t(opt.i18n)}
            </button>
          ))}
        </div>

        {/* Label (texto libre) */}
        {showLabel && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('activities.fields.label')}
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder={t('activities.fields.labelPlaceholder')}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>
        )}

        {/* Duración + Intensidad */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('activities.fields.duration')}
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              inputMode="numeric"
              value={draft.duration_min}
              onChange={(e) => set('duration_min', e.target.value)}
              placeholder={t('activities.fields.durationPlaceholder')}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {t('activities.fields.intensity')}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              inputMode="numeric"
              value={draft.intensity}
              onChange={(e) => set('intensity', e.target.value)}
              placeholder="1–10"
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Notas */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            {t('activities.fields.notes')}
          </label>
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('activities.fields.notesPlaceholder')}
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none resize-none"
          />
        </div>

        {errorKey && <p className="text-xs text-red-600 mb-3">{t(errorKey)}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
