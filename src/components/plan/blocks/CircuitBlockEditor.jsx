import { useState } from 'react'
import { Plus, Trash2, Tag, ArrowUp, ArrowDown } from 'lucide-react'
import {
  CIRCUIT_TYPES, INTENSITY_LEVELS, EXERCISE_MODES, emptyCircuitExercise,
} from '../../../utils/planHelpers'

/**
 * Editor del bloque CIRCUITO.
 * Config a nivel bloque (HIIT / AMRAP / EMOM / Libre).
 * Lista de ejercicios con tipo por reps o por tiempo.
 */
export default function CircuitBlockEditor({
  block,
  onUpdate,
  onUpdateExercises,
  exercises = [],
  exerciseTags = [],
  tagAssignments = [],
}) {
  const circuitType = block.circuit_type || 'hiit'
  const list = block.exercises || []

  function addExercise() {
    const ex = emptyCircuitExercise()
    ex.order_index = list.length
    onUpdateExercises([...list, ex])
  }

  function updateExercise(i, patch) {
    onUpdateExercises(list.map((ex, idx) => idx === i ? { ...ex, ...patch } : ex))
  }

  function removeExercise(i) {
    onUpdateExercises(list.filter((_, idx) => idx !== i))
  }

  function moveExercise(i, dir) {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = [...list]
    const [item] = next.splice(i, 1)
    next.splice(j, 0, item)
    onUpdateExercises(next.map((ex, k) => ({ ...ex, order_index: k })))
  }

  return (
    <div className="space-y-3">
      {/* Tipo de circuito */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Tipo de circuito</label>
        <div className="grid grid-cols-2 gap-1.5">
          {CIRCUIT_TYPES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => onUpdate({ circuit_type: t.key })}
              className={`rounded-xl border-2 p-2 text-left transition-all ${
                circuitType === t.key
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`text-xs font-semibold ${circuitType === t.key ? 'text-orange-700' : 'text-gray-700'}`}>
                {t.label}
              </p>
              <p className="text-[10px] text-gray-400 leading-tight">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Configuración del circuito según tipo */}
      {circuitType === 'hiit' && (
        <div className="bg-orange-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-orange-700">Estructura HIIT</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Trabajo (s)</label>
              <input
                type="number" min="0" className="input text-sm" placeholder="40"
                value={block.circuit_work_seconds || ''}
                onChange={e => onUpdate({ circuit_work_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Descanso (s)</label>
              <input
                type="number" min="0" className="input text-sm" placeholder="20"
                value={block.circuit_rest_seconds || ''}
                onChange={e => onUpdate({ circuit_rest_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Rondas</label>
              <input
                type="number" min="0" className="input text-sm" placeholder="4"
                value={block.circuit_rounds || ''}
                onChange={e => onUpdate({ circuit_rounds: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {(circuitType === 'amrap' || circuitType === 'emom') && (
        <div className="bg-orange-50 rounded-xl p-3">
          <label className="text-xs font-semibold text-orange-700 mb-1 block">
            Duración total (min)
          </label>
          <input
            type="number" min="0" className="input text-sm"
            placeholder={circuitType === 'amrap' ? '12' : '10'}
            value={block.circuit_total_minutes || ''}
            onChange={e => onUpdate({ circuit_total_minutes: e.target.value })}
          />
        </div>
      )}

      {/* Intensidad general */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Intensidad (opcional)</label>
        <select
          className="input text-sm"
          value={block.circuit_intensity || 'moderate'}
          onChange={e => onUpdate({ circuit_intensity: e.target.value })}
        >
          {INTENSITY_LEVELS.map(i => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </select>
      </div>

      {/* Lista de ejercicios */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700">Ejercicios del circuito</p>
        {list.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            Sin ejercicios todavía
          </p>
        )}
        {list.map((ex, i) => (
          <CircuitExerciseRow
            key={ex.id || `new-${i}`}
            ex={ex}
            index={i}
            total={list.length}
            exercises={exercises}
            exerciseTags={exerciseTags}
            tagAssignments={tagAssignments}
            onUpdate={(patch) => updateExercise(i, patch)}
            onRemove={() => removeExercise(i)}
            onMove={(dir) => moveExercise(i, dir)}
          />
        ))}
        <button
          onClick={addExercise}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Agregar ejercicio al circuito
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Fila de ejercicio dentro del circuito (más compacto que fuerza)
// ============================================================
function CircuitExerciseRow({
  ex, index, total,
  exercises, exerciseTags, tagAssignments,
  onUpdate, onRemove, onMove,
}) {
  const [tagFilter, setTagFilter] = useState('')
  const mode = ex.exercise_mode || 'reps'

  const filtered = tagFilter
    ? exercises.filter(e =>
        tagAssignments.some(ta => ta.exercise_id === e.id && ta.tag_id === tagFilter)
      )
    : exercises

  return (
    <div className="bg-gray-50 rounded-xl p-2.5 space-y-2">
      <div className="flex items-start gap-1">
        <div className="flex-1 space-y-2">
          {/* Tag filter + ejercicio */}
          {exerciseTags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Tag size={12} className="text-gray-400 flex-shrink-0" />
              <select
                className="input text-[11px] py-1"
                value={tagFilter}
                onChange={e => setTagFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {exerciseTags.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <select
              className="input text-sm"
              value={ex.exercise_id || ''}
              onChange={e => onUpdate({ exercise_id: e.target.value })}
            >
              <option value="">Seleccionar ejercicio...</option>
              {filtered.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* Tipo (reps/tiempo) + valor */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Tipo</label>
              <select
                className="input text-sm"
                value={mode}
                onChange={e => onUpdate({ exercise_mode: e.target.value })}
              >
                {EXERCISE_MODES.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            {mode === 'time' ? (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Duración (seg)</label>
                <input
                  type="number" min="0" className="input text-sm"
                  placeholder="30"
                  value={ex.duration_seconds || ''}
                  onChange={e => onUpdate({ duration_seconds: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Reps</label>
                <input
                  className="input text-sm"
                  placeholder="10"
                  value={(ex.suggested_reps_array || [''])[0] || ''}
                  onChange={e => onUpdate({ suggested_reps_array: [e.target.value] })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Controles laterales */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 pt-1">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded disabled:opacity-30"
          >
            <ArrowUp size={12} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded disabled:opacity-30"
          >
            <ArrowDown size={12} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-red-400 hover:bg-red-50 rounded"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
