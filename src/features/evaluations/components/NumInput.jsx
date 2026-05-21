// Input numérico con label + unidad + hint opcionales.
// Wrapper genérico usado por los Forms de evaluation (1RM, Power, Cardio, etc.).
export default function NumInput({ label, value, onChange, placeholder, step = '1', unit, hint }) {
  return (
    <div>
      <label className="label text-xs">
        {label}
        {unit && <span className="text-gray-400 font-normal ml-1">({unit})</span>}
      </label>
      <input
        type="number"
        step={step}
        className="input text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}
