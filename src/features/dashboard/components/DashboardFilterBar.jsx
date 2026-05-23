import { X } from 'lucide-react'

// ============================================================
// DashboardFilterBar
// ------------------------------------------------------------
// UI de los 3 filtros del CoachDashboard:
//   [ Alumno ▾ ]  [ Plan ▾ (dep) ]  [ Período ▾ ]  [ Limpiar ]
//
// Self-contained: recibe todo desde useCoachDashboardFilters como prop
// (no se acopla al hook para facilitar tests + composición).
// ============================================================

export default function DashboardFilterBar({
  studentId,
  planId,
  periodKey,
  setStudent,
  setPlan,
  setPeriod,
  clearAll,
  studentOptions = [],
  planOptionsForStudent = [],
  periodOptions = [],
  loadingOptions = false,
  className = '',
}) {
  const hasAnyFilter = !!(studentId || planId || (periodKey && periodKey !== '30d'))

  return (
    <div className={`card ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Alumno */}
        <FilterSelect
          label="Alumno"
          value={studentId || ''}
          onChange={(v) => setStudent(v)}
          disabled={loadingOptions || studentOptions.length === 0}
          options={[
            { value: '', label: 'Todos' },
            ...studentOptions.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />

        {/* Plan (dependiente del alumno) */}
        <FilterSelect
          label="Plan"
          value={planId || ''}
          onChange={(v) => setPlan(v)}
          disabled={!studentId || planOptionsForStudent.length === 0}
          options={[
            { value: '', label: studentId ? 'Todos del alumno' : 'Elegí un alumno' },
            ...planOptionsForStudent.map((a) => ({
              value: a.id,
              label: `${a.plan?.title || 'Sin título'}${a.status !== 'active' ? ` · ${a.status}` : ''}`,
            })),
          ]}
        />

        {/* Período */}
        <FilterSelect
          label="Período"
          value={periodKey || ''}
          onChange={(v) => setPeriod(v)}
          options={periodOptions.map((p) => ({ value: p.key, label: p.label }))}
        />

        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="flex flex-col gap-1 min-w-[140px] flex-1 max-w-[220px]">
      <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className={`text-sm rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-gray-50 disabled:text-gray-400 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
