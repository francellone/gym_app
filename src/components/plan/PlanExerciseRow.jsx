import { Trash2 } from 'lucide-react'
import {
  BLOCK_LETTERS, BLOCK_NUMBERS, PSE_OPTIONS,
  createRepsArray
} from '../../utils/planHelpers'

/**
 * Fila de ejercicio dentro del editor de plan.
 * Incorpora:
 *  - Bloque letra (A-Z) + subbloque número (1-10)
 *  - Reps por serie: cuando suggested_sets > 0, muestra N inputs
 *  - Validaciones inline
 */
export default function PlanExerciseRow({ ex, index, onUpdate, onRemove, exercises }) {
  const setsCount = parseInt(ex.suggested_sets) || 0

  function handleSetsChange(val) {
    const n = parseInt(val) || 0
    // Ajustar el array de reps según el nuevo número de series
    const currentReps = ex.suggested_reps_array || []
    let newReps
    if (n === 0) {
      newReps = ['']
    } else if (n > currentReps.length) {
      // Extender con el último valor o vacío
      const lastVal = currentReps[currentReps.length - 1] || ''
      newReps = [...currentReps, ...Array(n - currentReps.length).fill(lastVal)]
    } else {
      newReps = currentReps.slice(0, n)
    }
    onUpdate(index, 'suggested_sets', val)
    onUpdate(index, 'suggested_reps_array', newReps)
  }

  function handleRepChange(serieIdx, val) {
    const newReps = [...(ex.suggested_reps_array || [])]
    newReps[serieIdx] = val
    onUpdate(index, 'suggested_reps_array', newReps)
  }

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-3">

          {/* Ejercicio + Bloque */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Ejercicio *</label>
              <select
                className="input text-sm"
                value={ex.exercise_id}
                onChange={e => onUpdate(index, 'exercise_id', e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {exercises.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Bloque</label>
                <select
                  className="input text-sm"
                  value={ex.block_letter}
                  onChange={e => onUpdate(index, 'block_letter', e.target.value)}
                >
                  <option value="">—</option>
                  {BLOCK_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sub-bloque</label>
                <select
                  className="input text-sm"
                  value={ex.block_number}
                  onChange={e => onUpdate(index, 'block_number', e.target.value)}
                  disabled={!ex.block_letter}
                >
                  <option value="">—</option>
                  {BLOCK_NUMBERS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Series */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Series</label>
              <input
                type="number"
                min="0"
                max="20"
                className="input text-sm"
                placeholder="3"
                value={ex.suggested_sets}
                onChange={e => handleSetsChange(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Peso sugerido</label>
              <input
                className="input text-sm"
                placeholder="10kg, corporal..."
                value={ex.suggested_weight}
                onChange={e => onUpdate(index, 'suggested_weight', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Descanso</label>
              <input
                className="input text-sm"
                placeholder="1m 30s"
                value={ex.rest_time}
                onChange={e => onUpdate(index, 'rest_time', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">PSE sugerida</label>
              <select
                className="input text-sm"
                value={ex.suggested_pse}
                onChange={e => onUpdate(index, 'suggested_pse', e.target.value)}
              >
                <option value="">Sin especificar</option>
                {PSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Reps por serie */}
          {setsCount > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-2 block font-medium">
                Repeticiones por serie
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: setsCount }, (_, i) => (
                  <div key={i}>
                    <label className="text-xs text-gray-400 mb-1 block">Serie {i + 1}</label>
                    <input
                      className="input text-sm text-center"
                      placeholder="10"
                      value={(ex.suggested_reps_array || [])[i] || ''}
                      onChange={e => handleRepChange(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas técnicas */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas técnicas</label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Indicaciones técnicas del ejercicio..."
              value={ex.extra_notes}
              onChange={e => onUpdate(index, 'extra_notes', e.target.value)}
            />
          </div>
        </div>

        {/* Botón eliminar */}
        <button
          onClick={() => onRemove(index)}
          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0 mt-6"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
