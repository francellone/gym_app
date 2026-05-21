import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  Info,
  PlayCircle,
  Lock,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import {
  parseReps,
  displayReps,
  WEIGHT_MODES,
  REPS_UNITS,
  getEffectiveWeightMode,
  getEffectiveUnilateral,
  readLogReps,
  readLogWeights,
} from '@/features/plans/helpers'
import { PSE_OPTIONS, pseColor } from '../helpers'
import ValidationWarning from './ValidationWarning'

// Parsear el peso sugerido del coach a número (ej: "20kg" → "20", "BW" → "")
// Helper privado de este componente.
function parseSuggestedWeight(val) {
  if (!val || val === 'None' || val === 'none') return ''
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? '' : n.toString()
}

// ============================================================
// Tarjeta de ejercicio individual (bloques de fuerza)
// ============================================================
// Renderiza un ejercicio dentro de un StrengthBlockRunCard. Maneja:
//   - inputs de series/reps/peso por serie (con sugeridos del coach
//     pre-cargados y herencia de modo: log > plan_exercise > exercise)
//   - PSE 1-10, notas, modo unilateral, unidad de reps
//   - validación cliente con ValidationWarning para pesos sospechosos
//   - save / edit / delete vía callbacks del padre (onSaveLog / onDeleteLog)
//
// El payload que arma para la RPC `save_workout_log` cumple los CHECK
// constraints del back (bodyweight ⇒ weights NULL, etc.). Notas van
// aparte vía postWorkoutLogNote() en el padre (Round 2b del refactor m26:
// workout_logs.notes fue dropeada en v26d).
export default function ExerciseCard({ planEx, log, onSaveLog, onDeleteLog, suggestedSets }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [warning, setWarning] = useState(null)
  const [pendingData, setPendingData] = useState(null)
  const [setsLimitHit, setSetsLimitHit] = useState(false)

  // Parsear reps sugeridas
  const suggestedRepsRaw = planEx.suggested_reps
  const suggestedRepsArr = parseReps(suggestedRepsRaw)

  // setsCount: cantidad sugerida por el coach (para inicialización y display)
  const setsCount = parseInt(suggestedSets || planEx.suggested_sets) || 0
  // maxSets: tope duro (99 = sin tope cuando el coach no lo definió)
  const maxSets = setsCount || 99

  // Modo de peso y unilateral efectivos (herencia: log > plan_exercise > exercise)
  const exerciseDef = planEx.exercise || {}
  const initialWeightMode = getEffectiveWeightMode({
    log,
    planExercise: planEx,
    exercise: exerciseDef,
  })
  const initialUnilateral = getEffectiveUnilateral({
    log,
    planExercise: planEx,
    exercise: exerciseDef,
  })

  // Pesos sugeridos por serie: prioridad suggested_weights (array), fallback a suggested_weight (legacy)
  const suggestedWeightsArr = (() => {
    const count = setsCount
    const legacy = parseSuggestedWeight(planEx.suggested_weight)
    if (planEx.suggested_weights) {
      try {
        const parsed = JSON.parse(planEx.suggested_weights)
        if (Array.isArray(parsed)) {
          return Array.from({ length: count || parsed.length }, (_, i) =>
            parsed[i] != null ? String(parsed[i]) : ''
          )
        }
      } catch {}
      // valor único (no array)
      const val = parseSuggestedWeight(planEx.suggested_weights)
      return Array.from({ length: count || 1 }, () => val)
    }
    return Array.from({ length: count || 1 }, () => legacy)
  })()

  // Inicializar reps con valores sugeridos si no hay log previo.
  // Prioridad: actual_reps_jsonb (nuevo) > actual_reps (legacy) > sugeridas.
  const initRepsArr = () => {
    const fromLog = log ? readLogReps(log) : []
    if (fromLog.length > 0) {
      const parsed = fromLog.map((r) => (r != null ? String(r) : ''))
      if (setsCount > 0 && parsed.length !== setsCount) {
        return Array.from({ length: setsCount }, (_, i) => parsed[i] || suggestedRepsArr[i] || '')
      }
      return parsed
    }
    return setsCount > 0
      ? Array.from({ length: setsCount }, (_, i) => suggestedRepsArr[i] || '')
      : [suggestedRepsArr[0] || '']
  }

  // Inicializar pesos por serie. Prioridad: actual_weights_jsonb > legacy > sugeridos.
  const initWeightsArr = () => {
    const fromLog = log ? readLogWeights(log) : []
    if (fromLog.length > 0) {
      const asStrings = fromLog.map((w) => (w != null && w !== '' ? String(w) : ''))
      if (setsCount > 0 && asStrings.length !== setsCount) {
        return Array.from(
          { length: setsCount },
          (_, i) => asStrings[i] || suggestedWeightsArr[i] || ''
        )
      }
      return asStrings.length > 0 ? asStrings : [suggestedWeightsArr[0] || '']
    }
    // Default: pesos sugeridos por el coach
    return setsCount > 0
      ? Array.from({ length: setsCount }, (_, i) => suggestedWeightsArr[i] || '')
      : [suggestedWeightsArr[0] || '']
  }

  const [logData, setLogData] = useState({
    // Series: pre-rellenado con el valor sugerido por el coach
    actual_sets: log?.actual_sets?.toString() || (setsCount > 0 ? setsCount.toString() : ''),
    actual_reps_arr: initRepsArr(),
    // Pesos por serie: pre-rellenados con sugeridos del coach
    actual_weights_arr: initWeightsArr(),
    perceived_difficulty: log?.perceived_difficulty || null,
    notes: log?.notes || '',
    completed: log?.completed || false,
    // Modo de peso del log (override sobre el efectivo si el alumno lo cambia)
    weight_mode: log?.weight_mode || initialWeightMode,
    unilateral: log?.unilateral != null ? !!log.unilateral : initialUnilateral,
    reps_unit: log?.reps_unit || null,
  })

  // Sincronizar state local con el prop `log` cuando cambia (p.ej. tras un
  // save: el padre actualiza logs[exId] y nosotros re-renderizamos con un
  // nuevo log). Sin este efecto, el useState solo se evaluaba al mount y
  // el badge verde podía quedar desfasado hasta un refresh.
  useEffect(() => {
    if (!log) return
    setLogData((p) => ({
      ...p,
      actual_sets: log.actual_sets?.toString() || p.actual_sets,
      perceived_difficulty: log.perceived_difficulty ?? p.perceived_difficulty,
      notes: log.notes ?? p.notes,
      completed: !!log.completed,
      weight_mode: log.weight_mode || p.weight_mode,
      unilateral: log.unilateral != null ? !!log.unilateral : p.unilateral,
      reps_unit: log.reps_unit || p.reps_unit,
    }))
  }, [log?.id, log?.completed, log?.updated_at])

  const completed = logData.completed
  const isBodyweight = logData.weight_mode === 'bodyweight'
  const showWeightInputs = !isBodyweight

  function handleRepsChange(idx, val) {
    const newArr = [...logData.actual_reps_arr]
    newArr[idx] = val
    setLogData((p) => ({ ...p, actual_reps_arr: newArr }))
  }

  function handleWeightChange(idx, val) {
    const newArr = [...logData.actual_weights_arr]
    newArr[idx] = val
    setLogData((p) => ({ ...p, actual_weights_arr: newArr }))
  }

  function handleSetsChange(val) {
    let n = parseInt(val) || 0

    // TOPE DURO: no puede superar el máximo definido por el coach
    if (maxSets < 99 && n > maxSets) {
      n = maxSets
      // Mostrar aviso breve sin pregunta de confirmación
      setSetsLimitHit(true)
      setTimeout(() => setSetsLimitHit(false), 2000)
    }

    const currentReps = logData.actual_reps_arr
    const currentWeights = logData.actual_weights_arr
    let newReps, newWeights
    if (n === 0) {
      newReps = ['']
      newWeights = ['']
    } else if (n > currentReps.length) {
      // Al agregar series, pre-rellenar con valores sugeridos si los hay
      newReps = [
        ...currentReps,
        ...Array.from(
          { length: n - currentReps.length },
          (_, i) => suggestedRepsArr[currentReps.length + i] || ''
        ),
      ]
      newWeights = [
        ...currentWeights,
        ...Array.from(
          { length: n - currentWeights.length },
          (_, i) => suggestedWeightsArr[currentWeights.length + i] || ''
        ),
      ]
    } else {
      newReps = currentReps.slice(0, n)
      newWeights = currentWeights.slice(0, n)
    }
    setLogData((p) => ({
      ...p,
      actual_sets: n.toString(),
      actual_reps_arr: newReps,
      actual_weights_arr: newWeights,
    }))
  }

  // Construye el payload limpio para la RPC save_workout_log.
  //
  // La RPC espera:
  //   - p_reps: jsonb array de números (POR LADO si unilateral=true)
  //   - p_weights: jsonb array de números (null si bodyweight)
  //   - p_weight_mode, p_unilateral, p_reps_unit
  //   - El back hace doble escritura interna a actual_reps / actual_weights / actual_weight
  function buildSaveData() {
    const repsArrRaw = logData.actual_reps_arr || []
    const repsNumeric = repsArrRaw.map((r) => parseFloat(r)).map((n) => (isNaN(n) ? null : n))

    const weightsArrRaw = logData.actual_weights_arr || []
    const weightsNumeric = weightsArrRaw.map((w) => parseFloat(w)).map((n) => (isNaN(n) ? null : n))

    // Length de reps determina cuántas series tiene el log.
    // Si bodyweight, anulamos weights enteramente para satisfacer el CHECK
    // (constraint: bodyweight ⇒ actual_weights_jsonb IS NULL).
    const weightsForRpc = isBodyweight
      ? null
      : // Igualar largo de weights con reps (rellena con null si faltan)
        Array.from({ length: repsNumeric.length }, (_, i) =>
          weightsNumeric[i] != null ? weightsNumeric[i] : null
        )

    return {
      // valores que necesita la RPC
      p_reps: repsNumeric,
      p_weights: weightsForRpc,
      p_weight_mode: logData.weight_mode || 'with_weight',
      p_unilateral: !!logData.unilateral,
      p_reps_unit: logData.reps_unit || null,
      p_actual_sets: logData.actual_sets
        ? parseInt(logData.actual_sets)
        : repsNumeric.length || null,
      p_perceived_difficulty: logData.perceived_difficulty || null,
      p_perceived_difficulty_label: logData.perceived_difficulty
        ? PSE_OPTIONS.find((p) => p.value === logData.perceived_difficulty)?.label
        : null,
      // Round 2b: el RPC ya no escribe a workout_logs.notes (la columna
      // se dropeó en v26d). Pasamos null y después del save llamamos
      // a postWorkoutLogNote() con el body para que aterrice en el panel.
      p_notes: null,
      p_completed: true,
      // Body del alumno para postWorkoutLogNote(). Underscore-prefijado
      // para distinguir de los p_* que van a la RPC; saveLog del padre
      // lo extrae antes de hacer rpcArgs.
      _noteBody: logData.notes || '',
    }
  }

  // Validación cliente — devuelve un objeto { type, message } o null.
  //   type='warning' → modal de "Verificá este dato" (deja guardar igual)
  function validate(data) {
    // Falta PSE
    if (!data.p_perceived_difficulty) {
      return {
        type: 'warning',
        message:
          'No registraste el esfuerzo percibido (PSE). Tu coach lo usa para ajustar el plan.',
      }
    }
    // Pesos demasiado altos (solo si no es BW)
    if (!isBodyweight && Array.isArray(data.p_weights)) {
      const nums = data.p_weights.filter((w) => w != null && !isNaN(w))
      if (nums.some((w) => w > 500)) {
        return {
          type: 'warning',
          message: 'Algún peso registrado parece muy alto. ¿Son correctos?',
        }
      }
      // Soft-warning "Solo con barra" + peso > 20kg
      if (data.p_weight_mode === 'barbell_only' && nums.some((w) => w > 20)) {
        return {
          type: 'warning',
          message:
            'Cargaste "Solo con barra" pero el peso supera los 20kg (peso de la barra). ¿Es correcto?',
        }
      }
    }
    return null
  }

  async function attemptSave() {
    const data = buildSaveData()
    const warn = validate(data)
    if (warn) {
      setPendingData(data)
      setWarning(warn.message)
      return
    }
    await doSave(data)
  }

  async function doSave(data) {
    setWarning(null)
    setPendingData(null)
    setSaving(true)
    try {
      await onSaveLog(planEx.id, data)
      setLogData((p) => ({ ...p, completed: true }))
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDeleteLog(planEx.id)
      // Resetear estado local al estado inicial (sin log)
      setLogData({
        actual_sets: setsCount > 0 ? setsCount.toString() : '',
        actual_reps_arr:
          setsCount > 0
            ? Array.from({ length: setsCount }, (_, i) => suggestedRepsArr[i] || '')
            : [suggestedRepsArr[0] || ''],
        actual_weights_arr:
          setsCount > 0
            ? Array.from({ length: setsCount }, (_, i) => suggestedWeightsArr[i] || '')
            : [suggestedWeightsArr[0] || ''],
        perceived_difficulty: null,
        notes: '',
        completed: false,
        // Reset también la configuración a los defaults heredados
        weight_mode: initialWeightMode,
        unilateral: initialUnilateral,
        reps_unit: null,
      })
      setConfirmDelete(false)
      setEditing(false)
      setExpanded(false)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  const actualSetsCount = parseInt(logData.actual_sets) || setsCount || 1

  return (
    <>
      {warning && (
        <ValidationWarning
          message={warning}
          onConfirm={() => doSave(pendingData)}
          onCancel={() => {
            setWarning(null)
            setPendingData(null)
          }}
        />
      )}

      {/* Modal de confirmación para desmarcar */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">¿Desmarcar ejercicio?</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Se borrarán los datos registrados de <strong>{planEx.exercise?.name}</strong>.
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 size={14} />
                    Sí, desmarcar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 transition-all overflow-hidden ${
          completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!completed) setEditing(true)
            }}
            className="flex-shrink-0"
          >
            {completed ? (
              <CheckCircle2 size={24} className="text-green-500" />
            ) : (
              <Circle size={24} className="text-gray-300" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {planEx.block_label && (
                <span className="badge bg-primary-100 text-primary-700 flex-shrink-0">
                  {planEx.block_label}
                </span>
              )}
              <p
                className={`font-semibold text-sm truncate ${completed ? 'text-green-800' : 'text-gray-900'}`}
              >
                {planEx.exercise?.name}
              </p>
            </div>
            {/* Sugerido por el coach */}
            <p className="text-xs text-gray-400 mt-0.5">
              Sugerido:{' '}
              {[
                planEx.suggested_sets && `${planEx.suggested_sets} series`,
                suggestedRepsRaw && `× ${displayReps(suggestedRepsRaw)}`,
                planEx.suggested_weight &&
                  planEx.suggested_weight !== 'None' &&
                  `· ${planEx.suggested_weight}`,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
            {log &&
              !expanded &&
              (() => {
                const wArr = readLogWeights(log).filter((w) => w != null && w !== '')
                const wDisplay = wArr.length > 0 ? `${wArr.join(', ')}kg` : null
                return (
                  <p className="text-xs text-green-600 mt-0.5 font-medium">
                    ✓{' '}
                    {[
                      log.actual_sets && `${log.actual_sets}s`,
                      wDisplay,
                      log.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )
              })()}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {planEx.exercise?.video_url && planEx.exercise.video_url.startsWith('http') && (
              <a
                href={planEx.exercise.video_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
              >
                <PlayCircle size={18} />
              </a>
            )}
            {expanded ? (
              <ChevronDown size={18} className="text-gray-400 rotate-180" />
            ) : (
              <ChevronDown size={18} className="text-gray-400" />
            )}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-4">
            {/* Technique notes */}
            {(planEx.extra_notes || planEx.exercise?.technique_notes) && (
              <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  {planEx.extra_notes || planEx.exercise?.technique_notes}
                </p>
              </div>
            )}

            {planEx.suggested_pse && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">PSE sugerida:</span>
                <span className="badge bg-orange-100 text-orange-700">{planEx.suggested_pse}</span>
              </div>
            )}

            {/* Log form */}
            {!completed || editing ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">Registrar entrenamiento</p>

                {/* Series */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    Series realizadas
                    {maxSets < 99 && (
                      <span className="flex items-center gap-0.5 text-gray-400">
                        <Lock size={10} />
                        máx. {maxSets}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={maxSets < 99 ? maxSets : undefined}
                    className={`input text-sm text-center w-full transition-colors ${
                      setsLimitHit ? 'border-orange-400 bg-orange-50' : ''
                    }`}
                    placeholder={maxSets < 99 ? maxSets.toString() : '—'}
                    value={logData.actual_sets}
                    onChange={(e) => handleSetsChange(e.target.value)}
                  />
                  {setsLimitHit && (
                    <p className="text-[11px] text-orange-500 mt-0.5 flex items-center gap-1">
                      <Lock size={10} /> Límite del plan: {maxSets} series
                    </p>
                  )}
                </div>

                {/* Configuración del ejercicio (modo, unilateral, unidad reps) */}
                <div className="rounded-xl bg-white border border-gray-200 p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">Tipo de peso</label>
                      <select
                        className="input text-xs py-1.5"
                        value={logData.weight_mode}
                        onChange={(e) => setLogData((p) => ({ ...p, weight_mode: e.target.value }))}
                      >
                        {WEIGHT_MODES.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">Unidad reps</label>
                      <select
                        className="input text-xs py-1.5"
                        value={logData.reps_unit || ''}
                        onChange={(e) =>
                          setLogData((p) => ({ ...p, reps_unit: e.target.value || null }))
                        }
                      >
                        <option value="">reps (default)</option>
                        {REPS_UNITS.filter((u) => u.key !== 'reps').map((u) => (
                          <option key={u.key} value={u.key}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-600"
                      checked={!!logData.unilateral}
                      onChange={(e) => setLogData((p) => ({ ...p, unilateral: e.target.checked }))}
                    />
                    <span className="text-xs text-gray-700">
                      Unilateral (cada lado)
                      {logData.unilateral && (
                        <span className="block text-[10px] text-violet-600 font-bold">
                          Las reps van POR LADO, no como total.
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {/* Reps + Peso por serie (grilla combinada) */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium">
                    {showWeightInputs
                      ? logData.unilateral
                        ? 'Reps por lado y peso por serie'
                        : 'Repeticiones y peso por serie'
                      : logData.unilateral
                        ? 'Reps por lado por serie'
                        : 'Repeticiones por serie'}
                  </label>
                  {/* Encabezados */}
                  <div
                    className={`grid gap-1.5 mb-1 px-0.5 ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                  >
                    <div />
                    <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                      {logData.unilateral
                        ? 'Reps × lado'
                        : logData.reps_unit && logData.reps_unit !== 'reps'
                          ? REPS_UNITS.find((u) => u.key === logData.reps_unit)?.short || 'Reps'
                          : 'Reps'}
                      {suggestedRepsRaw && (
                        <span className="block font-normal normal-case text-primary-400">
                          sug: {displayReps(suggestedRepsRaw)}
                        </span>
                      )}
                    </div>
                    {showWeightInputs && (
                      <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                        Peso (kg)
                        {suggestedWeightsArr.some(Boolean) && (
                          <span className="block font-normal normal-case text-primary-400">
                            sug: {suggestedWeightsArr.filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Fila por serie */}
                  {Array.from({ length: actualSetsCount }, (_, i) => (
                    <div
                      key={i}
                      className={`grid gap-1.5 mb-1.5 items-center ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                    >
                      <div className="text-xs text-center text-gray-400 font-medium">{i + 1}</div>
                      <input
                        className="input text-sm text-center"
                        placeholder={suggestedRepsArr[i] || '—'}
                        value={logData.actual_reps_arr[i] || ''}
                        onChange={(e) => handleRepsChange(i, e.target.value)}
                      />
                      {showWeightInputs && (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="input text-sm text-center"
                          placeholder={suggestedWeightsArr[i] || '0'}
                          value={logData.actual_weights_arr[i] || ''}
                          onChange={(e) => handleWeightChange(i, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                  {!showWeightInputs && (
                    <p className="text-[11px] text-emerald-600 mt-1.5 px-0.5">
                      Sin peso · solo se cargan reps.
                    </p>
                  )}
                  {/* Soft-warning inline si barbell_only + algún peso > 20 */}
                  {showWeightInputs &&
                    logData.weight_mode === 'barbell_only' &&
                    logData.actual_weights_arr.some((w) => parseFloat(w) > 20) && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          Marcaste <strong>"Solo con barra"</strong> pero hay pesos &gt; 20kg. La
                          barra olímpica suele pesar 20kg. ¿Querés cambiar a "Con peso"?
                        </p>
                      </div>
                    )}
                </div>

                {/* PSE por ejercicio */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Esfuerzo percibido (PSE)
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() =>
                          setLogData((p) => ({
                            ...p,
                            perceived_difficulty: p.perceived_difficulty === n ? null : n,
                          }))
                        }
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                          logData.perceived_difficulty === n
                            ? pseColor(n)
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Observaciones</label>
                  <textarea
                    className="input text-sm resize-none"
                    rows={2}
                    placeholder="¿Cómo te salió? ¿Alguna dificultad?"
                    value={logData.notes}
                    onChange={(e) => setLogData((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={attemptSave}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Marcar como completado
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-green-700">✓ Completado</p>
                {(() => {
                  const repsArr = readLogReps(log).filter((r) => r != null && r !== '')
                  const wArr = readLogWeights(log).filter((w) => w != null && w !== '')
                  const repsLabel = log?.unilateral ? ' por lado' : ''
                  const unitLabel =
                    log?.reps_unit && log.reps_unit !== 'reps' ? ` ${log.reps_unit}` : ''
                  return (
                    <p className="text-xs text-green-600">
                      {[
                        log?.actual_sets && `${log.actual_sets} series`,
                        repsArr.length > 0 && `× ${repsArr.join(', ')}${unitLabel}${repsLabel}`,
                        wArr.length > 0 && `${wArr.join(', ')}kg`,
                        log?.weight_mode === 'bodyweight' && wArr.length === 0 && 'sin peso',
                        log?.weight_mode === 'barbell_only' && 'solo barra',
                        log?.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )
                })()}
                {log?.notes && <p className="text-xs text-green-600 italic">"{log.notes}"</p>}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-green-700 underline"
                  >
                    Editar
                  </button>
                  <span className="text-green-300 text-xs">·</span>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={11} />
                    Desmarcar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
