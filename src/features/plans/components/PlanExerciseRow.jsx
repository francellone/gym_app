import { useState } from 'react'
import { Trash2, Info } from 'lucide-react'
import ExercisePicker from '@/features/exercises/components/ExercisePicker'
import { useExerciseCatalog } from '@/features/exercises/ExerciseCatalogContext'
import {
  BLOCK_LETTERS,
  BLOCK_NUMBERS,
  PSE_OPTIONS,
  WEIGHT_MODES,
  WEIGHT_MODE_BY_KEY,
  getEffectiveWeightMode,
  getEffectiveUnilateral,
  getEffectivePct1rm,
} from '../helpers'

// Devuelve true si el array tiene más de un valor único no vacío
// → indica que el ejercicio fue cargado en modo "diferencial por serie".
function hasVariation(arr) {
  if (!arr || arr.length <= 1) return false
  const unique = new Set(arr.filter((v) => v !== '' && v !== null && v !== undefined))
  return unique.size > 1
}

/**
 * Fila de ejercicio dentro del editor de plan.
 * Props:
 *  - ex: datos del ejercicio en el plan (UI format)
 *  - index: índice en el array de sección
 *  - onUpdate(index, field, value)
 *  - onRemove(index)
 *
 * El catálogo (ejercicios + etiquetas + asignaciones) sale del
 * ExerciseCatalogContext, no de props.
 */
export default function PlanExerciseRow({
  ex,
  index,
  onUpdate,
  onUpdateMulti,
  onLetterChange,
  onRemove,
}) {
  const { exercises, exerciseTags, tagAssignments } = useExerciseCatalog()
  const setsCount = parseInt(ex.suggested_sets) || 0

  // Ejercicio del catálogo seleccionado (para conocer sus defaults)
  const selectedExercise = ex.exercise_id ? exercises.find((e) => e.id === ex.exercise_id) : null
  const effectiveWeightMode = getEffectiveWeightMode({
    planExercise: ex,
    exercise: selectedExercise,
  })
  const effectiveUnilateral = getEffectiveUnilateral({
    planExercise: ex,
    exercise: selectedExercise,
  })
  // '%RM' y 'sin peso' no llevan columna de kilos: el %RM prescribe un
  // porcentaje y los kilos se derivan del 1RM de cada alumna.
  const isPct1rm = effectiveWeightMode === 'pct_1rm'
  const showWeightInputs = WEIGHT_MODE_BY_KEY[effectiveWeightMode]?.showsWeightInputs ?? true
  const pct1rmValue = getEffectivePct1rm({ planExercise: ex })
  const rmReferenceExercise = ex.rm_reference_exercise_id
    ? exercises.find((e) => e.id === ex.rm_reference_exercise_id)
    : null
  const repsLabel = effectiveUnilateral ? 'Reps (por lado)' : 'Reps'

  // Modo "diferencial por serie": cada serie puede tener reps/peso distintos.
  // Por defecto OFF (simple: 1 valor para todas las series).
  // Si al cargar el ejercicio hay variación entre series, lo activamos.
  const [differential, setDifferential] = useState(
    () => hasVariation(ex.suggested_reps_array) || hasVariation(ex.suggested_weights_array)
  )

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

  // Modo diferencial: el coach edita una serie específica.
  // Caso especial: al editar la serie 1, autocompletamos las series posteriores
  // que estén "sincronizadas" con ella — es decir, vacías o con el valor previo
  // de la serie 1. Series ya modificadas a mano no se pisan.
  // (Esto soporta el tipeo carácter por carácter: '1' → '10' → '100'.)
  function handleRepChange(serieIdx, val) {
    const current = ex.suggested_reps_array || []
    const newReps = [...current]
    if (serieIdx === 0) {
      const prevFirst = current[0]
      newReps[0] = val
      for (let i = 1; i < newReps.length; i++) {
        const isEmpty = newReps[i] === '' || newReps[i] == null
        const matchesPrev = newReps[i] === prevFirst
        if (isEmpty || matchesPrev) newReps[i] = val
      }
    } else {
      newReps[serieIdx] = val
    }
    onUpdate(index, 'suggested_reps_array', newReps)
  }

  function handleWeightChange(serieIdx, val) {
    const current = ex.suggested_weights_array || []
    const newWeights = [...current]
    if (serieIdx === 0) {
      const prevFirst = current[0]
      newWeights[0] = val
      for (let i = 1; i < newWeights.length; i++) {
        const isEmpty = newWeights[i] === '' || newWeights[i] == null
        const matchesPrev = newWeights[i] === prevFirst
        if (isEmpty || matchesPrev) newWeights[i] = val
      }
    } else {
      newWeights[serieIdx] = val
    }
    onUpdate(index, 'suggested_weights_array', newWeights)
  }

  // Modo simple: un solo valor de reps que se replica a todas las series.
  function handleSimpleRepChange(val) {
    const len = Math.max(1, setsCount)
    const newReps = Array(len).fill(val)
    onUpdate(index, 'suggested_reps_array', newReps)
  }

  function handleSimpleWeightChange(val) {
    const len = Math.max(1, setsCount)
    const newWeights = Array(len).fill(val)
    onUpdate(index, 'suggested_weights_array', newWeights)
  }

  // Toggle del modo diferencial.
  // - Activar: dejamos los arrays como están (si venían iguales, las series
  //   muestran ese mismo valor; si estaban vacías, quedan vacías y se autocompletan
  //   cuando el coach edite la serie 1).
  // - Desactivar: pisamos todas las series con el valor de la serie 1.
  function handleToggleDifferential(checked) {
    setDifferential(checked)
    if (!checked) {
      const len = Math.max(1, setsCount)
      const firstRep = (ex.suggested_reps_array || [])[0] || ''
      const firstWeight = (ex.suggested_weights_array || [])[0] || ''
      const patches = {
        suggested_reps_array: Array(len).fill(firstRep),
        suggested_weights_array: Array(len).fill(firstWeight),
      }
      if (onUpdateMulti) {
        onUpdateMulti(index, patches)
      } else {
        onUpdate(index, 'suggested_reps_array', patches.suggested_reps_array)
        onUpdate(index, 'suggested_weights_array', patches.suggested_weights_array)
      }
    }
  }

  // Tag del ejercicio seleccionado (para mostrarlo)
  const selectedExTags = ex.exercise_id
    ? tagAssignments
        .filter((ta) => ta.exercise_id === ex.exercise_id)
        .map((ta) => exerciseTags.find((t) => t.id === ta.tag_id))
        .filter(Boolean)
    : []

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-3">
          {/* Filtro de etiqueta + selector de ejercicio + bloque */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <ExercisePicker
                value={ex.exercise_id}
                onChange={(id) => onUpdate(index, 'exercise_id', id)}
                label="Ejercicio"
                required
              >
                {/* Tags del ejercicio elegido */}
                {selectedExTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedExTags.map((t) => (
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
              </ExercisePicker>
            </div>

            {/* Bloque */}
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Bloque</label>
                <select
                  className="input text-sm"
                  value={ex.block_letter}
                  onChange={(e) =>
                    onLetterChange
                      ? onLetterChange(index, e.target.value)
                      : onUpdate(index, 'block_letter', e.target.value)
                  }
                >
                  <option value="">—</option>
                  {BLOCK_LETTERS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sub</label>
                <select
                  className="input text-sm"
                  value={ex.block_number}
                  onChange={(e) => onUpdate(index, 'block_number', e.target.value)}
                  disabled={!ex.block_letter}
                >
                  <option value="">—</option>
                  {BLOCK_NUMBERS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Modo de peso + Unilateral (overrides del plan_exercise sobre catálogo) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Modo de peso</label>
              <select
                className="input text-sm"
                value={ex.weight_mode ?? ''}
                onChange={(e) => onUpdate(index, 'weight_mode', e.target.value || null)}
              >
                <option value="">
                  Heredar
                  {selectedExercise
                    ? ` (${WEIGHT_MODE_BY_KEY[selectedExercise.default_weight_mode || 'with_weight']?.short || 'Con peso'})`
                    : ''}
                </option>
                {WEIGHT_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-600"
                  checked={
                    ex.unilateral != null ? !!ex.unilateral : !!selectedExercise?.default_unilateral
                  }
                  onChange={(e) => onUpdate(index, 'unilateral', e.target.checked)}
                />
                <span>
                  Unilateral
                  <span className="block text-[11px] text-gray-500 font-normal">
                    {effectiveUnilateral
                      ? 'Las reps van por lado'
                      : selectedExercise?.default_unilateral
                        ? 'Override: forzar bilateral'
                        : ''}
                  </span>
                </span>
              </label>
              {ex.unilateral != null && (
                <button
                  type="button"
                  onClick={() => onUpdate(index, 'unilateral', null)}
                  className="ml-2 text-[11px] text-gray-400 hover:text-gray-600 underline"
                  title="Quitar override y heredar del ejercicio"
                >
                  heredar
                </button>
              )}
            </div>
          </div>

          {/* Configuración del %RM (solo si el modo de peso es '% del máximo') */}
          {isPct1rm && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-amber-800 font-semibold mb-1 block">
                    % del máximo
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="200"
                      step="1"
                      className="input text-sm pr-7"
                      placeholder="70"
                      value={ex.pct_1rm ?? ''}
                      onChange={(e) => onUpdate(index, 'pct_1rm', e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
                <div>
                  <ExercisePicker
                    value={ex.rm_reference_exercise_id || ''}
                    onChange={(id) => onUpdate(index, 'rm_reference_exercise_id', id || null)}
                    label="Tomar el máximo de otro ejercicio (opcional)"
                    placeholder="Usar el máximo de este mismo ejercicio"
                  />
                </div>
              </div>
              <p className="text-[11px] text-amber-700 leading-snug">
                Los kilos no se escriben: se calculan como{' '}
                <strong className="font-medium">
                  {pct1rmValue ? `${pct1rmValue}%` : 'el %'} del máximo
                  {rmReferenceExercise ? ` de ${rmReferenceExercise.name}` : ''}
                </strong>{' '}
                de cada persona, así el plan sube solo cuando sube su máximo. Si todavía no tiene
                evaluación, va a ver el porcentaje.
              </p>
            </div>
          )}

          {/* Aviso de agrupación: la pausa de un bloque (misma letra) es del grupo */}
          {ex.block_letter && (
            <div className="flex items-start gap-1.5 text-[11px] text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2 py-1.5">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                Bloque {ex.block_letter}: los ejercicios con la misma letra van encadenados,{' '}
                <strong className="font-medium">sin pausa entre ellos</strong>. El descanso que
                cargues es la pausa del grupo (al terminar la vuelta), no entre serie y serie. Se
                muestra una sola vez al alumno.
              </span>
            </div>
          )}

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
                onChange={(e) => handleSetsChange(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Descanso</label>
              <input
                className="input text-sm"
                placeholder="1m 30s"
                value={ex.rest_time}
                onChange={(e) => onUpdate(index, 'rest_time', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">PSE sugerida</label>
              <select
                className="input text-sm"
                value={ex.suggested_pse}
                onChange={(e) => onUpdate(index, 'suggested_pse', e.target.value)}
              >
                <option value="">Sin especificar</option>
                {PSE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reps + Peso (modo simple o diferencial) */}
          {setsCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="text-xs text-gray-500 font-medium">
                  {differential
                    ? showWeightInputs
                      ? 'Repeticiones y peso por serie'
                      : 'Repeticiones por serie'
                    : showWeightInputs
                      ? 'Repeticiones y peso'
                      : 'Repeticiones'}
                  {effectiveUnilateral && (
                    <span className="ml-1 text-[10px] text-violet-600 font-bold">· POR LADO</span>
                  )}
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-blue-600"
                    checked={differential}
                    onChange={(e) => handleToggleDifferential(e.target.checked)}
                  />
                  Diferencial por serie
                </label>
              </div>

              {!differential ? (
                /* Modo simple: un solo input de reps + peso (oculto si BW) */
                <div className={`grid gap-1.5 ${showWeightInputs ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide mb-1">
                      {repsLabel}
                    </div>
                    <input
                      className="input text-sm text-center"
                      placeholder="10"
                      value={(ex.suggested_reps_array || [])[0] || ''}
                      onChange={(e) => handleSimpleRepChange(e.target.value)}
                    />
                  </div>
                  {showWeightInputs && (
                    <div>
                      <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide mb-1">
                        Peso (kg)
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="input text-sm text-center"
                        placeholder="kg"
                        value={(ex.suggested_weights_array || [])[0] || ''}
                        onChange={(e) => handleSimpleWeightChange(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Encabezados de columna */}
                  <div
                    className={`grid gap-1.5 mb-1 px-0.5 ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                  >
                    <div />
                    <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                      {repsLabel}
                    </div>
                    {showWeightInputs && (
                      <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                        Peso (kg)
                      </div>
                    )}
                  </div>
                  {/* Fila por serie */}
                  {Array.from({ length: setsCount }, (_, i) => (
                    <div
                      key={i}
                      className={`grid gap-1.5 mb-1.5 items-center ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                    >
                      <div className="text-xs text-center text-gray-400 font-medium">{i + 1}</div>
                      <input
                        className="input text-sm text-center"
                        placeholder="10"
                        value={(ex.suggested_reps_array || [])[i] || ''}
                        onChange={(e) => handleRepChange(i, e.target.value)}
                      />
                      {showWeightInputs && (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="input text-sm text-center"
                          placeholder="kg"
                          value={(ex.suggested_weights_array || [])[i] || ''}
                          onChange={(e) => handleWeightChange(i, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400 mt-1 px-0.5">
                    El valor de la serie 1 autocompleta las series vacías.
                  </p>
                </>
              )}

              {!showWeightInputs &&
                (isPct1rm ? (
                  <p className="text-[11px] text-amber-700 mt-2 px-0.5">
                    Peso prescripto por porcentaje · los kilos se derivan del máximo.
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 mt-2 px-0.5">
                    Ejercicio sin peso · solo se cargan reps.
                  </p>
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
              onChange={(e) => onUpdate(index, 'extra_notes', e.target.value)}
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
