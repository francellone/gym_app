import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { format } from 'date-fns'
import {
  CIRCUIT_TYPES,
  INTENSITY_LEVELS,
  EXERCISE_MODES,
  WEIGHT_MODES,
  WEIGHT_MODE_BY_KEY,
  emptyCircuitExercise,
  getEffectiveWeightMode,
  getEffectivePct1rm,
} from '../../helpers'
import ExercisePicker from '@/features/exercises/components/ExercisePicker'
import { useExerciseCatalog } from '@/features/exercises/ExerciseCatalogContext'
import { resolvePrescribedWeight, formatOneRmDate } from '@/features/evaluations/oneRm'
import { usePct1rmPreview } from '../../Pct1rmPreviewContext'

/**
 * Editor del bloque CIRCUITO.
 * Config a nivel bloque (HIIT / AMRAP / EMOM / Libre).
 * Lista de ejercicios con tipo por reps o por tiempo.
 */
export default function CircuitBlockEditor({ block, onUpdate, onUpdateExercises }) {
  const circuitType = block.circuit_type || 'hiit'
  const list = block.exercises || []

  function addExercise() {
    const ex = emptyCircuitExercise()
    ex.order_index = list.length
    onUpdateExercises([...list, ex])
  }

  function updateExercise(i, patch) {
    onUpdateExercises(list.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex)))
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
          {CIRCUIT_TYPES.map((t) => (
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
              <p
                className={`text-xs font-semibold ${circuitType === t.key ? 'text-orange-700' : 'text-gray-700'}`}
              >
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
                type="number"
                min="0"
                className="input text-sm"
                placeholder="40"
                value={block.circuit_work_seconds || ''}
                onChange={(e) => onUpdate({ circuit_work_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Descanso (s)</label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                placeholder="20"
                value={block.circuit_rest_seconds || ''}
                onChange={(e) => onUpdate({ circuit_rest_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Rondas</label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                placeholder="4"
                value={block.circuit_rounds || ''}
                onChange={(e) => onUpdate({ circuit_rounds: e.target.value })}
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
            type="number"
            min="0"
            className="input text-sm"
            placeholder={circuitType === 'amrap' ? '12' : '10'}
            value={block.circuit_total_minutes || ''}
            onChange={(e) => onUpdate({ circuit_total_minutes: e.target.value })}
          />
        </div>
      )}

      {/* Intensidad general */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Intensidad (opcional)</label>
        <select
          className="input text-sm"
          value={block.circuit_intensity || 'moderate'}
          onChange={(e) => onUpdate({ circuit_intensity: e.target.value })}
        >
          {INTENSITY_LEVELS.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      {/* Todo el circuito al X% del máximo (lo heredan los ejercicios) */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Todo el circuito al % del máximo (opcional)
        </label>
        <div className="relative">
          <input
            type="number"
            min="1"
            max="200"
            step="1"
            className="input text-sm pr-7"
            placeholder="Ej: 50"
            value={block.default_pct_1rm || ''}
            onChange={(e) => onUpdate({ default_pct_1rm: e.target.value })}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
            %
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
          Se aplica a los ejercicios en modo <strong className="font-medium">% del máximo</strong>{' '}
          que no tengan su propio porcentaje. Cada ejercicio puede pisarlo.
        </p>
      </div>

      {/* Lista de ejercicios */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700">Ejercicios del circuito</p>
        {list.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">Sin ejercicios todavía</p>
        )}
        {list.map((ex, i) => (
          <CircuitExerciseRow
            key={ex.id || `new-${i}`}
            ex={ex}
            index={i}
            total={list.length}
            blockDefaultPct={block.default_pct_1rm || ''}
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
function CircuitExerciseRow({ ex, index, total, blockDefaultPct, onUpdate, onRemove, onMove }) {
  const { exercises } = useExerciseCatalog()
  const preview = usePct1rmPreview()
  const mode = ex.exercise_mode || 'reps'

  // Peso del ejercicio dentro del circuito (antes no existía: el circuito es
  // primo de fuerza, también se carga con peso · ver modelo de 2 ejes).
  const selectedExercise = ex.exercise_id ? exercises.find((e) => e.id === ex.exercise_id) : null
  const effectiveWeightMode = getEffectiveWeightMode({
    planExercise: ex,
    exercise: selectedExercise,
  })
  const isPct1rm = effectiveWeightMode === 'pct_1rm'
  const showWeightInput = WEIGHT_MODE_BY_KEY[effectiveWeightMode]?.showsWeightInputs ?? true
  const inheritedPct = getEffectivePct1rm({
    planExercise: ex,
    block: { default_pct_1rm: blockDefaultPct },
  })
  // Vista previa "como [persona]" (mismo criterio que la fila de fuerza).
  const previewWeight =
    isPct1rm && preview.studentId
      ? resolvePrescribedWeight({
          planExercise: ex,
          block: { default_pct_1rm: blockDefaultPct },
          weightMode: 'pct_1rm',
          oneRmMap: preview.oneRmMap,
          today: format(new Date(), 'yyyy-MM-dd'),
        })
      : null

  return (
    <div className="bg-gray-50 rounded-xl p-2.5 space-y-2">
      <div className="flex items-start gap-1">
        <div className="flex-1 space-y-2">
          {/* Ejercicio (con filtro por etiqueta y alta rápida) */}
          <ExercisePicker
            value={ex.exercise_id || ''}
            onChange={(id) => onUpdate({ exercise_id: id })}
            label={null}
            placeholder="Seleccionar ejercicio..."
            size="xs"
          />

          {/* Tipo (reps/tiempo) + valor */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Tipo</label>
              <select
                className="input text-sm"
                value={mode}
                onChange={(e) => onUpdate({ exercise_mode: e.target.value })}
              >
                {EXERCISE_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {mode === 'time' ? (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Duración (seg)</label>
                <input
                  type="number"
                  min="0"
                  className="input text-sm"
                  placeholder="30"
                  value={ex.duration_seconds || ''}
                  onChange={(e) => onUpdate({ duration_seconds: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Reps</label>
                <input
                  className="input text-sm"
                  placeholder="10"
                  value={(ex.suggested_reps_array || [''])[0] || ''}
                  onChange={(e) => onUpdate({ suggested_reps_array: [e.target.value] })}
                />
              </div>
            )}
          </div>

          {/* Modo de peso + valor (kg o % del máximo) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">Peso</label>
              <select
                className="input text-sm"
                value={ex.weight_mode ?? ''}
                onChange={(e) => onUpdate({ weight_mode: e.target.value || null })}
              >
                <option value="">
                  Heredar
                  {selectedExercise
                    ? ` (${WEIGHT_MODE_BY_KEY[selectedExercise.default_weight_mode || 'with_weight']?.short || 'Con peso'})`
                    : ''}
                </option>
                {WEIGHT_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.short}
                  </option>
                ))}
              </select>
            </div>
            {isPct1rm ? (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">% del máximo</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  step="1"
                  className="input text-sm"
                  placeholder={blockDefaultPct ? `${blockDefaultPct} (del bloque)` : '50'}
                  value={ex.pct_1rm ?? ''}
                  onChange={(e) => onUpdate({ pct_1rm: e.target.value })}
                />
              </div>
            ) : showWeightInput ? (
              <div>
                <label className="text-[11px] text-gray-500 mb-0.5 block">Peso (kg)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input text-sm"
                  placeholder="kg"
                  value={(ex.suggested_weights_array || [''])[0] || ''}
                  onChange={(e) => onUpdate({ suggested_weights_array: [e.target.value] })}
                />
              </div>
            ) : (
              <div className="flex items-end">
                <p className="text-[11px] text-emerald-600 pb-2">Sin peso · solo reps</p>
              </div>
            )}
          </div>
          {isPct1rm &&
            (previewWeight ? (
              <p className="text-[11px] leading-snug">
                {previewWeight.status === 'derived' ? (
                  <span className="text-emerald-700">
                    <strong className="font-semibold">{preview.studentName}:</strong>{' '}
                    <strong className="font-semibold">{previewWeight.kg} kg</strong> ·{' '}
                    {previewWeight.pct}% de {previewWeight.oneRm} kg, evaluado el{' '}
                    {formatOneRmDate(previewWeight.oneRmDate)}
                  </span>
                ) : previewWeight.status === 'missing_1rm' ? (
                  <span className="text-amber-800">
                    {preview.studentName} no tiene evaluación de este ejercicio: va a ver el
                    porcentaje.
                  </span>
                ) : (
                  <span className="text-amber-800">
                    Falta el porcentaje: cargalo acá o a nivel del circuito.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 leading-snug">
                {inheritedPct
                  ? `Los kilos se calculan solos: ${inheritedPct}% del máximo de cada persona.`
                  : 'Falta el porcentaje: cargalo acá o a nivel del circuito.'}
              </p>
            ))}
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
          <button onClick={onRemove} className="p-1 text-red-400 hover:bg-red-50 rounded">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
