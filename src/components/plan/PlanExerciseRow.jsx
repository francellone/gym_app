import { useState } from 'react'
import { Trash2, Tag } from 'lucide-react'
import {
  BLOCK_LETTERS, BLOCK_NUMBERS, PSE_OPTIONS,
} from '../../utils/planHelpers'

/**
 * Fila de ejercicio dentro del editor de plan.
 * Props:
 *  - ex: datos del ejercicio en el plan (UI format)
 *  - index: índice en el array de sección
 *  - exercises: lista completa de ejercicios
 *  - exerciseTags: [{ id, name, color }] — tags del coach
 *  - tagAssignments: [{ exercise_id, tag_id }] — asignaciones
 *  - onUpdate(index, field, value)
 *  - onRemove(index)
 */
export default function PlanExerciseRow({
  ex, index, onUpdate, onUpdateMulti, onRemove,
  exercises = [],
  exerciseTags = [],
  tagAssignments = [],
}) {
  const [tagFilter, setTagFilter] = useState('')
  const setsCount = parseInt(ex.suggested_sets) || 0

  // Filtrar ejercicios según tag seleccionado
  const filteredExercises = tagFilter
    ? exercises.filter(e =>
        tagAssignments.some(ta => ta.exercise_id === e.id && ta.tag_id === tagFilter)
      )
    : exercises

  function handleSetsChange(val) {
    const n = parseInt(val) || 0

    // Redimensionar reps
    const currentReps = ex.suggested_reps_array || []
    let newReps
    if (n === 0) {
      newReps = ['']
    } else if (n > currentReps.length) {
      const lastRep = currentReps[currentReps.length - 1] || ''
      newReps = [...currentReps, ...Array(n - currentReps.length).fill(lastRep)]
    } else {
      newReps = currentReps.slice(0, n)
    }

    // Redimensionar pesos por serie
    const currentWeights = ex.suggested_weights_array || []
    let newWeights
    if (n === 0) {
      newWeights = ['']
    } else if (n > currentWeights.length) {
      const lastWeight = currentWeights[currentWeights.length - 1] || ''
      newWeights = [...currentWeights, ...Array(n - currentWeights.length).fill(lastWeight)]
    } else {
      newWeights = currentWeights.slice(0, n)
    }

    // Si el padre soporta actualización multi-campo, lo usamos en una sola
    // llamada para evitar que React descarte las actualizaciones anteriores
    // por stale closure (el bug clásico de "Series no guarda el valor").
    if (onUpdateMulti) {
      onUpdateMulti(index, {
        suggested_sets: val,
        suggested_reps_array: newReps,
        suggested_weights_array: newWeights,
      })
    } else {
      // Fallback: el padre usa setEstado(prev => ...) que sí es correcto
      onUpdate(index, 'suggested_sets', val)
      onUpdate(index, 'suggested_reps_array', newReps)
      onUpdate(index, 'suggested_weights_array', newWeights)
    }
  }

  function handleRepChange(serieIdx, val) {
    const newReps = [...(ex.suggested_reps_array || [])]
    newReps[serieIdx] = val
    onUpdate(index, 'suggested_reps_array', newReps)
  }

  function handleWeightChange(serieIdx, val) {
    const newWeights = [...(ex.suggested_weights_array || [])]
    newWeights[serieIdx] = val
    onUpdate(index, 'suggested_weights_array', newWeights)
  }

  // Tag del ejercicio seleccionado (para mostrarlo)
  const selectedExTags = ex.exercise_id
    ? tagAssignments
        .filter(ta => ta.exercise_id === ex.exercise_id)
        .map(ta => exerciseTags.find(t => t.id === ta.tag_id))
        .filter(Boolean)
    : []

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-3">

          {/* Filtro de etiqueta + selector de ejercicio + bloque */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 space-y-2">
              {/* Tag filter */}
              {exerciseTags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag size={13} className="text-gray-400 flex-shrink-0" />
                  <select
                    className="input text-xs py-1.5"
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                  >
                    <option value="">Todos los ejercicios</option>
                    {exerciseTags.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {tagFilter && (
                    <span className="text-xs text-gray-400">
                      {filteredExercises.length} ej.
                    </span>
                  )}
                </div>
              )}

              {/* Exercise select */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ejercicio *</label>
                <select
                  className="input text-sm"
                  value={ex.exercise_id}
                  onChange={e => onUpdate(index, 'exercise_id', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {filteredExercises.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>

                {/* Tags del ejercicio elegido */}
                {selectedExTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedExTags.map(t => (
                      <span
                        key={t.id}
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: t.color + '22', color: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bloque */}
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
                <label className="text-xs text-gray-500 mb-1 block">Sub</label>
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

          {/* Series, descanso, PSE */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

          {/* Reps + Peso por serie */}
          {setsCount > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-2 block font-medium">
                Repeticiones y peso por serie
              </label>
              {/* Encabezados de columna */}
              <div className="grid grid-cols-[2rem_1fr_1fr] gap-1.5 mb-1 px-0.5">
                <div />
                <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                  Reps
                </div>
                <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                  Peso (kg)
                </div>
              </div>
              {/* Fila por serie */}
              {Array.from({ length: setsCount }, (_, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-1.5 mb-1.5 items-center">
                  <div className="text-xs text-center text-gray-400 font-medium">{i + 1}</div>
                  <input
                    className="input text-sm text-center"
                    placeholder="10"
                    value={(ex.suggested_reps_array || [])[i] || ''}
                    onChange={e => handleRepChange(i, e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="input text-sm text-center"
                    placeholder="kg"
                    value={(ex.suggested_weights_array || [])[i] || ''}
                    onChange={e => handleWeightChange(i, e.target.value)}
                  />
                </div>
              ))}
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
