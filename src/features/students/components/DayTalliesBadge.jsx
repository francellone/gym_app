import { formatTallyForDisplay } from '../dayTalliesLogic'

// ============================================================
// DayTalliesBadge
// ------------------------------------------------------------
// Q2 — Muestra cuántas veces se hizo cada día del plan, distinguiendo
// sesiones enteras (✓) de parciales (◐). Pedido literal de Anto
// (doc 13 §Q2): "Día A ✓✓✓ = 3 veces, Día B ✓✓ = 2".
//
// Convenciones de display (decididas con Franco 2026-05-23):
//   - total < 5 → tildes literales (entero=✓, parcial=◐)
//   - total ≥ 5 → "×N (M◐)" colapsado
//   - Día sin registros → no se renderiza el pill
//   - Tallies vacío → render del placeholder
//
// Props:
//   tallies    Record<section, SectionTally>  (output de computeDayTallies)
//   sections   string[]  Orden a renderizar (default day_a..day_d)
//   dayLabels  Record<section, string>  Override de labels
//   variant    'default' | 'compact'    'compact' es para inline en TodayWorkoutPage
//   showLegend boolean   Si true, suma leyenda chica al final
//   className  string
//   emptyText  string    Texto cuando tallies vacío
// ============================================================

const DEFAULT_SECTIONS = ['day_a', 'day_b', 'day_c', 'day_d']

const DEFAULT_DAY_LABELS = {
  day_a: 'Día A',
  day_b: 'Día B',
  day_c: 'Día C',
  day_d: 'Día D',
}

export default function DayTalliesBadge({
  tallies,
  sections = DEFAULT_SECTIONS,
  dayLabels = DEFAULT_DAY_LABELS,
  variant = 'default',
  showLegend = false,
  className = '',
  emptyText = 'Todavía no hay registros de este plan',
}) {
  const safeTallies = tallies || {}

  // Filtramos secciones que efectivamente tienen registros.
  const visibleSections = sections.filter((s) => {
    const t = safeTallies[s]
    return t && (t.entero > 0 || t.parcial > 0)
  })

  if (visibleSections.length === 0) {
    return (
      <p className={`text-xs text-gray-400 italic ${className}`} role="status">
        {emptyText}
      </p>
    )
  }

  const isCompact = variant === 'compact'
  const containerClasses = isCompact
    ? `inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`
    : `flex flex-wrap items-center gap-2 ${className}`

  return (
    <div className={containerClasses}>
      {visibleSections.map((section) => {
        const t = safeTallies[section]
        const label = dayLabels[section] || section
        const display = formatTallyForDisplay(t)
        const hasParcial = t.parcial > 0

        if (isCompact) {
          return (
            <span
              key={section}
              className="text-xs font-medium text-gray-700 whitespace-nowrap"
              title={`${label}: ${t.entero} entero${t.entero === 1 ? '' : 's'}${
                hasParcial
                  ? `, ${t.parcial} parcial${t.parcial === 1 ? '' : 'es'}`
                  : ''
              }`}
            >
              <span className="text-gray-500">{label}</span>{' '}
              <span className="text-primary-700">{display}</span>
            </span>
          )
        }

        return (
          <span
            key={section}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-50 border border-primary-100 text-sm"
            title={`${label}: ${t.entero} entero${t.entero === 1 ? '' : 's'}${
              hasParcial
                ? `, ${t.parcial} parcial${t.parcial === 1 ? '' : 'es'}`
                : ''
            }`}
          >
            <span className="font-semibold text-primary-700">{label}</span>
            <span
              className={`tracking-wider ${hasParcial ? 'text-amber-700' : 'text-primary-600'}`}
            >
              {display}
            </span>
          </span>
        )
      })}

      {showLegend && (
        <span className="text-[11px] text-gray-400 ml-1">
          <span className="text-primary-600">✓</span> entero ·{' '}
          <span className="text-amber-700">◐</span> parcial
        </span>
      )}
    </div>
  )
}
