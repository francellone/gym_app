// Toggle Masculino / Femenino — usado por los cálculos que dependen de sexo
// (Cardio Rockport / Body composition).
export default function SexSelector({ value, onChange }) {
  return (
    <div>
      <label className="label text-xs">Sexo</label>
      <div className="flex gap-2">
        {[
          ['male', 'Masculino'],
          ['female', 'Femenino'],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
              value === k
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
