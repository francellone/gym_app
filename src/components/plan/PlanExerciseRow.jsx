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
  ex, index, onUpdate, onRemove,
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
    const currentReps = ex.suggested_reps_array || []
    let newReps
    if (n === 0) {
      newReps = ['']
    } else if (n > currentReps.length) {
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

          {/* Series, peso, descanso, PSE */}
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
