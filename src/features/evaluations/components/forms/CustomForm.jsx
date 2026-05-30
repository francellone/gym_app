import { MessageSquare, PlayCircle } from 'lucide-react'
import { pruebaTypeInfo } from '../../helpers'

// ============================================================
// FORM: Custom (tabla de pruebas configuradas por el coach)
// ============================================================
// Recibe: pruebas (evaluation_tests[]), responses (map test_id → {value, unit, comment})
//         onChange(testId, field, value)
//
// El alumno completa una respuesta por prueba + opcionalmente un comentario.
// El input se adapta al `test_type` de cada prueba vía PruebaInput.
export default function CustomForm({ pruebas, responses, onChange }) {
  if (pruebas.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        Esta evaluación no tiene pruebas configuradas. Pedile al coach que las agregue.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {pruebas.map((prueba, i) => {
        const typeInfo = pruebaTypeInfo(prueba.test_type)
        const resp = responses[prueba.id] || { value: '', unit: typeInfo.unit || '', comment: '' }

        return (
          <div key={prueba.id} className="border-2 border-gray-100 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 px-4 py-2.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">
                    {prueba.exercise_name || `Prueba ${i + 1}`}
                  </p>
                  {/* B7 (30/05): video de referencia del ejercicio (link de
                      Drive/YouTube cargado por el coach). El dato llega vía el
                      join exercises(video_url) que normaliza EvalWorkoutPage. */}
                  {prueba.video_url && prueba.video_url.startsWith('http') && (
                    <a
                      href={prueba.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                      title="Ver video del ejercicio"
                    >
                      <PlayCircle size={16} />
                    </a>
                  )}
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    {typeInfo.label}
                  </span>
                  {prueba.mandatory && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      Obligatoria
                    </span>
                  )}
                </div>
                {prueba.instructions && (
                  <p className="text-xs text-gray-500 mt-0.5">{prueba.instructions}</p>
                )}
                {prueba.expected_value && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    Esperado:{' '}
                    <strong>
                      {prueba.expected_value} {prueba.expected_unit}
                    </strong>
                  </p>
                )}
              </div>
            </div>

            {/* Input de respuesta */}
            <div className="px-4 py-3 space-y-3">
              <PruebaInput
                testType={prueba.test_type}
                typeInfo={typeInfo}
                value={resp.value}
                unit={resp.unit}
                onChangeValue={(v) => onChange(prueba.id, 'value', v)}
                onChangeUnit={(u) => onChange(prueba.id, 'unit', u)}
              />

              {/* Comentario del alumno */}
              <div>
                <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <MessageSquare size={12} /> Tu comentario (opcional)
                </label>
                <textarea
                  className="input resize-none text-sm"
                  rows={2}
                  placeholder="¿Cómo te sentiste en esta prueba?"
                  value={resp.comment || ''}
                  onChange={(e) => onChange(prueba.id, 'comment', e.target.value)}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Input adaptado al tipo de prueba (helper interno de CustomForm)
// ============================================================
function PruebaInput({ testType, typeInfo, value, unit, onChangeValue, onChangeUnit }) {
  switch (testType) {
    case 'reps':
      return (
        <div>
          <label className="label text-xs">Repeticiones</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              className="input flex-1 text-lg font-bold"
              placeholder="0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">reps</span>
          </div>
        </div>
      )

    case 'tiempo':
      return (
        <div>
          <label className="label text-xs">Tiempo (segundos)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.1"
              className="input flex-1 text-lg font-bold"
              placeholder="0.0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">seg</span>
          </div>
        </div>
      )

    case 'distancia':
      return (
        <div>
          <label className="label text-xs">Distancia</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.01"
              className="input flex-1 text-lg font-bold"
              placeholder="0.00"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <input
              className="input w-20 text-sm"
              placeholder="m"
              value={unit}
              onChange={(e) => onChangeUnit(e.target.value)}
            />
          </div>
        </div>
      )

    case 'peso':
      return (
        <div>
          <label className="label text-xs">Peso (kg)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.5"
              className="input flex-1 text-lg font-bold"
              placeholder="0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">kg</span>
          </div>
        </div>
      )

    case 'movilidad':
      return (
        <div>
          <label className="label text-xs">Medición (cm)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.1"
              className="input flex-1 text-lg font-bold"
              placeholder="0.0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">cm</span>
          </div>
        </div>
      )

    case 'tecnica': {
      const numVal = parseInt(value) || 0
      return (
        <div>
          <label className="label text-xs">Puntaje técnica (1–10)</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChangeValue(String(n))}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                  numVal === n
                    ? 'border-purple-500 bg-purple-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )
    }

    case 'video':
      return (
        <div>
          <label className="label text-xs">Link del video</label>
          <input
            type="url"
            className="input"
            placeholder="https://..."
            value={value}
            onChange={(e) => onChangeValue(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Podés usar YouTube, Google Drive, Instagram u otro servicio. No se sube el archivo.
          </p>
        </div>
      )

    default: // libre
      return (
        <div>
          <label className="label text-xs">Respuesta</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={typeInfo.placeholder || 'Escribí tu respuesta...'}
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <input
              className="input w-20 text-sm"
              placeholder="unidad"
              value={unit}
              onChange={(e) => onChangeUnit(e.target.value)}
            />
          </div>
        </div>
      )
  }
}
