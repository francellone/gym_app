// Caja de resultado destacada (ej: "VO2MAX = 42.3 ml/kg/min").
// No renderiza si value es null/undefined — útil para esconder métricas
// que el método actual no produce.
export default function ResultBox({ label, value, unit, sub }) {
  if (value === null || value === undefined) return null
  return (
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
      <p className="text-xs text-primary-600 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-primary-700">
        {value} <span className="text-base font-medium">{unit}</span>
      </p>
      {sub && <p className="text-xs text-primary-500 mt-1">{sub}</p>}
    </div>
  )
}
