import { cascadeSetValue } from '../seriesCascade'
import { useState } from 'react'
import { format } from 'date-fns'
import { Trash2, Info } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import ExercisePicker from '@/features/exercises/components/ExercisePicker'
import { resolvePrescribedWeight } from '@/features/evaluations/oneRm'
import { formatShortDate } from '@/i18n/dateLocale'
import { usePlanTargetPerson } from '../PlanTargetPersonContext'
import StudentExerciseHistoryLine from './StudentExerciseHistoryLine'
import { useExerciseCatalog } from '@/features/exercises/ExerciseCatalogContext'
import {
  BLOCK_LETTERS,
  BLOCK_NUMBERS,
  PSE_OPTIONS,
  PSE_OPTION_KEY,
  WEIGHT_MODES,
  WEIGHT_MODES_LOGGABLE,
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
  const { t } = useTranslation()
  const { exercises, exerciseTags, tagAssignments } = useExerciseCatalog()
  const target = usePlanTargetPerson()
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
  // Vista previa "como [persona]": resuelve los kilos que le tocarían a ella.
  const previewWeight =
    isPct1rm && target.studentId
      ? resolvePrescribedWeight({
          planExercise: ex,
          weightMode: 'pct_1rm',
          oneRmMap: target.oneRmMap,
          today: format(new Date(), 'yyyy-MM-dd'),
        })
      : null
  const repsLabel = effectiveUnilateral
    ? t('coach.planEditor.exerciseRow.repsPerSide2')
    : t('coach.planEditor.exerciseRow.reps')
  const bold = {
    b: <strong className="font-semibold" />,
    strong: <strong className="font-medium" />,
  }

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
  // v54: la regla vive en seriesCascade.js y la comparte el registro de la
  // persona (ExerciseCard, modo ajustar). Mismo comportamiento que antes.
  function handleRepChange(serieIdx, val) {
    onUpdate(index, 'suggested_reps_array', cascadeSetValue(ex.suggested_reps_array, serieIdx, val))
  }

  function handleWeightChange(serieIdx, val) {
    onUpdate(
      index,
      'suggested_weights_array',
      cascadeSetValue(ex.suggested_weights_array, serieIdx, val)
    )
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
        .map((ta) => exerciseTags.find((tag) => tag.id === ta.tag_id))
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
                label={t('coach.planEditor.exerciseRow.exercise')}
                required
              >
                {/* Tags del ejercicio elegido */}
                {selectedExTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedExTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: tag.color + '22', color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </ExercisePicker>
              {/* Con cuánto viene esta persona en este ejercicio */}
              <StudentExerciseHistoryLine exerciseId={ex.exercise_id} />
            </div>

            {/* Bloque */}
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {t('coach.planEditor.exerciseRow.block')}
                </label>
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
                <label className="text-xs text-gray-500 mb-1 block">
                  {t('coach.planEditor.exerciseRow.sub')}
                </label>
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
              <label className="text-xs text-gray-500 mb-1 block">
                {t('coach.planEditor.exerciseRow.weightMode')}
              </label>
              <select
                className="input text-sm"
                value={ex.weight_mode ?? ''}
                onChange={(e) => onUpdate(index, 'weight_mode', e.target.value || null)}
              >
                <option value="">
                  {selectedExercise
                    ? t('coach.planEditor.weightModes.inheritWith', {
                        mode: t(
                          `coach.planEditor.weightModes.${WEIGHT_MODE_BY_KEY[selectedExercise.default_weight_mode] ? selectedExercise.default_weight_mode : 'with_weight'}.short`
                        ),
                      })
                    : t('coach.planEditor.weightModes.inherit')}
                </option>
                {(target.basic ? WEIGHT_MODES_LOGGABLE : WEIGHT_MODES).map((m) => (
                  <option key={m.key} value={m.key}>
                    {t(`coach.planEditor.weightModes.${m.key}.label`)}
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
                  {t('coach.planEditor.exerciseRow.unilateral')}
                  <span className="block text-[11px] text-gray-500 font-normal">
                    {effectiveUnilateral
                      ? t('coach.planEditor.exerciseRow.repsPerSide')
                      : selectedExercise?.default_unilateral
                        ? t('coach.planEditor.exerciseRow.forceBilateral')
                        : ''}
                  </span>
                </span>
              </label>
              {ex.unilateral != null && (
                <button
                  type="button"
                  onClick={() => onUpdate(index, 'unilateral', null)}
                  className="ml-2 text-[11px] text-gray-400 hover:text-gray-600 underline"
                  title={t('coach.planEditor.exerciseRow.inheritTitle')}
                >
                  {t('coach.planEditor.exerciseRow.inheritLink')}
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
                    {t('coach.planEditor.exerciseRow.pctOfMax')}
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
                    label={t('coach.planEditor.exerciseRow.refExerciseLabel')}
                    placeholder={t('coach.planEditor.exerciseRow.refExercisePlaceholder')}
                  />
                </div>
              </div>
              {previewWeight && (
                <div className="rounded-lg bg-white border border-amber-200 px-2 py-1.5 text-[11px] leading-snug">
                  {previewWeight.status === 'derived' && (
                    <p className="text-emerald-700">
                      <Trans
                        i18nKey={
                          previewWeight.usedReference && rmReferenceExercise
                            ? 'coach.planEditor.pctPreview.derivedRef'
                            : 'coach.planEditor.pctPreview.derived'
                        }
                        values={{
                          name: target.studentName,
                          kg: previewWeight.kg,
                          pct: previewWeight.pct,
                          oneRm: previewWeight.oneRm,
                          exercise: rmReferenceExercise?.name,
                          date: formatShortDate(previewWeight.oneRmDate),
                        }}
                        components={bold}
                      />
                      {previewWeight.stale && (
                        <span className="text-amber-700">
                          {t('coach.planEditor.pctPreview.stale')}
                        </span>
                      )}
                    </p>
                  )}
                  {previewWeight.status === 'missing_1rm' && (
                    <p className="text-amber-800">
                      <Trans
                        i18nKey="coach.planEditor.pctPreview.missing1rm"
                        values={{ name: target.studentName }}
                        components={bold}
                      />
                    </p>
                  )}
                  {previewWeight.status === 'missing_pct' && (
                    <p className="text-amber-800">{t('coach.planEditor.pctPreview.missingPct')}</p>
                  )}
                </div>
              )}
              <p className="text-[11px] text-amber-700 leading-snug">
                <Trans
                  i18nKey={
                    rmReferenceExercise
                      ? 'coach.planEditor.exerciseRow.pctExplainRef'
                      : 'coach.planEditor.exerciseRow.pctExplain'
                  }
                  values={{
                    pct: pct1rmValue ? `${pct1rmValue}%` : t('coach.planEditor.exerciseRow.thePct'),
                    exercise: rmReferenceExercise?.name,
                  }}
                  components={bold}
                />
              </p>
            </div>
          )}

          {/* Aviso de agrupación: la pausa de un bloque (misma letra) es del grupo */}
          {ex.block_letter && (
            <div className="flex items-start gap-1.5 text-[11px] text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2 py-1.5">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                <Trans
                  i18nKey="coach.planEditor.exerciseRow.groupNotice"
                  values={{ letter: ex.block_letter }}
                  components={bold}
                />
              </span>
            </div>
          )}

          {/* Series, descanso, PSE */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {t('coach.planEditor.exerciseRow.sets')}
              </label>
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
              <label className="text-xs text-gray-500 mb-1 block">
                {t('coach.planEditor.exerciseRow.rest')}
              </label>
              <input
                className="input text-sm"
                placeholder="1m 30s"
                value={ex.rest_time}
                onChange={(e) => onUpdate(index, 'rest_time', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {t('coach.planEditor.exerciseRow.suggestedPse')}
              </label>
              <select
                className="input text-sm"
                value={ex.suggested_pse}
                onChange={(e) => onUpdate(index, 'suggested_pse', e.target.value)}
              >
                <option value="">{t('coach.planEditor.exerciseRow.unspecified')}</option>
                {PSE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {t(`workout.suggestedPseValue.${PSE_OPTION_KEY[p]}`)}
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
                      ? t('coach.planEditor.exerciseRow.repsWeightPerSet')
                      : t('coach.planEditor.exerciseRow.repsPerSet')
                    : showWeightInputs
                      ? t('coach.planEditor.exerciseRow.repsWeight')
                      : t('coach.planEditor.exerciseRow.repsOnly')}
                  {effectiveUnilateral && (
                    <span className="ml-1 text-[10px] text-violet-600 font-bold">
                      {t('coach.planEditor.exerciseRow.perSideTag')}
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-blue-600"
                    checked={differential}
                    onChange={(e) => handleToggleDifferential(e.target.checked)}
                  />
                  {t('coach.planEditor.exerciseRow.differential')}
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
                        {t('coach.planEditor.exerciseRow.weightKg')}
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
                        {t('coach.planEditor.exerciseRow.weightKg')}
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
                    {t('coach.planEditor.exerciseRow.cascadeHint')}
                  </p>
                </>
              )}

              {!showWeightInputs &&
                (isPct1rm ? (
                  <p className="text-[11px] text-amber-700 mt-2 px-0.5">
                    {t('coach.planEditor.exerciseRow.pctWeightNote')}
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 mt-2 px-0.5">
                    {t('coach.planEditor.exerciseRow.bodyweightNote')}
                  </p>
                ))}
            </div>
          )}

          {/* Notas técnicas */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              {t('coach.planEditor.exerciseRow.notes')}
            </label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder={t('coach.planEditor.exerciseRow.notesPlaceholder')}
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
