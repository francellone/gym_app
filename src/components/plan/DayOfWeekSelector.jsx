import { DAYS_OF_WEEK, normalizePreferredDays } from '../../utils/assignmentHelpers'

// ─────────────────────────────────────────────────────────────
// DayOfWeekSelector
//
// Selector multi-select de chips Lun..Dom (ISO: arranca en lunes
// para que se lea como un calendario, aunque internamente los
// valores siguen la convención JS Date.getDay() — 0=domingo, 6=sáb).
//
// Props:
//   value           Array<int 0-6>     días seleccionados.
//                                       Tolera null, string JSON o array sucio.
//   onChange        (Array<int>) => void
//   suggestedCount  number opcional    si se pasa, mostramos un hint
//                                       suave cuando length(value) ≠ count.
//   disabled        boolean
//   compact         boolean            chips más chicas (para usarlo en filas)
// ─────────────────────────────────────────────────────────────
export default function DayOfWeekSelector({
  value,
  onChange,
  suggestedCount,
  disabled = false,
  compact = false,
}) {
  const selected = new Set(normalizePreferredDays(value))

  // Orden visual ISO: Lun..Dom (1..6, 0).
  const order = [1, 2, 3, 4, 5, 6, 0]

  function toggle(day) {
    if (disabled) return
    const next = new Set(selected)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    onChange([...next].sort((a, b) => a - b))
  }

  const sizeClasses = compact
    ? 'h-8 min-w-[40px] text-[11px]'
    : 'h-10 min-w-[44px] text-xs'

  const countMismatch =
    typeof suggestedCount === 'number' &&
    selected.size > 0 &&
    selected.size !== suggestedCount

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Días de entrenamiento"
        className="flex gap-1.5 flex-wrap"
      >
        {order.map(d => {
          const day = DAYS_OF_WEEK[d]
          const isOn = selected.has(d)
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              aria-label={day.label}
              onClick={() => toggle(d)}
              disabled={disabled}
              className={[
                'flex-1 px-2 rounded-lg font-semibold transition-all border-2',
                sizeClasses,
                isOn
                  ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {day.short}
            </button>
          )
        })}
      </div>

      {/* Hint de mismatch contra sessions_per_week (no bloqueante) */}
      {countMismatch && (
        <p className="text-[11px] text-amber-600 leading-tight">
          El plan sugiere {suggestedCount} sesion{suggestedCount === 1 ? '' : 'es'} por semana
          y elegiste {selected.size} día{selected.size === 1 ? '' : 's'}. Podés guardarlo igual.
        </p>
      )}
    </div>
  )
}
