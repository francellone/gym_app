import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  SCHEDULE_MODES,
  normalizePreferredDays,
  getScheduleMode,
  getPreferredDays,
} from '../../utils/assignmentHelpers'
import DayOfWeekSelector from './DayOfWeekSelector'

// ─────────────────────────────────────────────────────────────
// ScheduleEditorInline
//
// Subcomponente "controlado" para usar dentro de un form (ej:
// el form de asignación de plan). Renderiza el toggle de modo
// (flexible / fixed) y, cuando está en fixed, el DayOfWeekSelector.
//
// El componente NO persiste — el padre lee value y manda al backend.
//
// Props:
//   value           { schedule_mode, preferred_days }
//   onChange        (value) => void
//   sessionsPerWeek number opcional, para hint de mismatch en el selector
//   disabled        boolean
// ─────────────────────────────────────────────────────────────
export function ScheduleEditorInline({
  value,
  onChange,
  sessionsPerWeek,
  disabled = false,
}) {
  const mode = value?.schedule_mode === 'fixed' ? 'fixed' : 'flexible'
  const days = normalizePreferredDays(value?.preferred_days)

  function setMode(nextMode) {
    if (disabled) return
    if (nextMode === mode) return
    onChange({
      schedule_mode: nextMode,
      // Al pasar a flexible limpiamos los días para mantener la
      // invariante del backend (validador rechaza days en flexible).
      preferred_days: nextMode === 'flexible' ? [] : days,
    })
  }

  function setDays(nextDays) {
    onChange({
      schedule_mode: 'fixed',
      preferred_days: normalizePreferredDays(nextDays),
    })
  }

  return (
    <div className="space-y-3">
      {/* Toggle segmentado flexible / fixed */}
      <div
        role="radiogroup"
        aria-label="Modo de horario"
        className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl"
      >
        {(['flexible', 'fixed']).map(key => {
          const cfg = SCHEDULE_MODES[key]
          const isOn = mode === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isOn}
              onClick={() => setMode(key)}
              disabled={disabled}
              className={[
                'py-2 rounded-lg text-sm font-semibold transition-all',
                isOn
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {cfg.label}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-gray-500 leading-snug">
        {SCHEDULE_MODES[mode].description}
      </p>

      {mode === 'fixed' && (
        <DayOfWeekSelector
          value={days}
          onChange={setDays}
          suggestedCount={sessionsPerWeek}
          disabled={disabled}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ScheduleEditorModal
//
// Modal independiente para editar schedule_mode + preferred_days
// de una asignación EXISTENTE. Persiste a Supabase al confirmar.
//
// Props:
//   assignment   plan_assignments row (al menos: id, schedule_mode,
//                  preferred_days, plan?.sessions_per_week, plan?.title)
//   onClose      () => void
//   onSaved      (updatedAssignment) => void  — callback opcional para
//                  que el padre refresque su lista
// ─────────────────────────────────────────────────────────────
export function ScheduleEditorModal({ assignment, onClose, onSaved }) {
  const initial = useMemo(
    () => ({
      schedule_mode: getScheduleMode(assignment),
      preferred_days: getPreferredDays(assignment),
    }),
    [assignment]
  )
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(initial)
    setError(null)
  }, [initial])

  const sessionsPerWeek = assignment?.plan?.sessions_per_week ?? null
  const isFixed = draft.schedule_mode === 'fixed'
  const dayCount = (draft.preferred_days || []).length
  const canSave =
    !saving &&
    (
      // flexible: siempre se puede guardar
      !isFixed ||
      // fixed: requiere al menos 1 día
      dayCount >= 1
    )

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = isFixed
        ? {
            schedule_mode: 'fixed',
            preferred_days: normalizePreferredDays(draft.preferred_days),
          }
        : {
            schedule_mode: 'flexible',
            preferred_days: null,
          }

      const { data, error: updErr } = await supabase
        .from('plan_assignments')
        .update(payload)
        .eq('id', assignment.id)
        .select()
        .single()
      if (updErr) throw updErr

      onSaved?.(data)
      onClose()
    } catch (err) {
      console.error('[ScheduleEditorModal] save', err)
      setError(err.message || 'Error al guardar el horario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <CalendarClock size={16} className="text-primary-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Horario de entrenamiento</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {assignment?.plan?.title || 'Asignación'}
                {sessionsPerWeek
                  ? ` · ${sessionsPerWeek} ses/sem sugeridas`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <ScheduleEditorInline
            value={draft}
            onChange={setDraft}
            sessionsPerWeek={sessionsPerWeek || undefined}
            disabled={saving}
          />

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-secondary flex-1 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
          >
            {saving
              ? <Loader size={14} className="animate-spin" />
              : 'Guardar'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
