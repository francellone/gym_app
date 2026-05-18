import { useEffect, useMemo, useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, ChevronRight,
  Dumbbell, PlayCircle, Info,
  Calendar, AlertTriangle, Clock, Lock, Trash2
} from 'lucide-react'
import {
  borgColor, parseReps, displayReps,
  DAY_SECTION_IDS, SECTION_LABELS,
  groupExercisesIntoBlocks, blockDisplayTitle,
  suggestNextDay,
  WEIGHT_MODES, REPS_UNITS,
  getEffectiveWeightMode, getEffectiveUnilateral,
  readLogReps, readLogWeights,
} from '../../utils/planHelpers'
import { buildErrorBanner } from '../../utils/errorHelpers'
import { postPSEDayNote, fetchSingleMirrorBodies, postWorkoutLogNote, postWorkoutBlockLogNote } from '../../lib/notes'
import AerobicBlockRunCard from '../../components/workout/AerobicBlockRunCard'
import CircuitBlockRunCard from '../../components/workout/CircuitBlockRunCard'
import WellbeingModal, { WELLBEING_METRICS, wellbeingColor } from '../../components/wellbeing/WellbeingModal'

// ============================================================
// Constantes
// ============================================================
const PSE_OPTIONS = [
  { value: 1, label: '1 - Muy fácil' }, { value: 2, label: '2 - Fácil' },
  { value: 3, label: '3 - Moderado' }, { value: 4, label: '4 - Algo duro' },
  { value: 5, label: '5 - Duro' }, { value: 6, label: '6 - Duro +' },
  { value: 7, label: '7 - Muy duro' }, { value: 8, label: '8 - Muy duro +' },
  { value: 9, label: '9 - Casi máximo' }, { value: 10, label: '10 - Máximo esfuerzo' },
]

// Etiquetas cortas PSE para el modal del día
const PSE_SHORT = [
  { value: 1, label: 'Muy fácil' }, { value: 2, label: 'Fácil' },
  { value: 3, label: 'Moderado' }, { value: 4, label: 'Algo duro' },
  { value: 5, label: 'Duro' }, { value: 6, label: 'Duro +' },
  { value: 7, label: 'Muy duro' }, { value: 8, label: 'Muy duro +' },
  { value: 9, label: 'Casi máx.' }, { value: 10, label: 'Máximo' },
]

// Labels cortas para días (tabs y modal)
const DAY_SHORT_LABELS = {
  day_a: 'Día A', day_b: 'Día B', day_c: 'Día C',
  day_d: 'Día D', day_e: 'Día E', day_f: 'Día F', day_g: 'Día G',
}

// Emojis para el header de sección
const SECTION_EMOJIS = {
  activation: '🔥',
  day_a: '💪', day_b: '🏋️', day_c: '🏃', day_d: '🎯',
  day_e: '⚡', day_f: '🔱', day_g: '🧘',
}

// Parsear el peso sugerido del coach a número (ej: "20kg" → "20", "BW" → "")
function parseSuggestedWeight(val) {
  if (!val || val === 'None' || val === 'none') return ''
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? '' : n.toString()
}

// Color del PSE por valor
function pseColor(n) {
  if (n >= 8) return 'bg-red-500 text-white'
  if (n >= 5) return 'bg-orange-400 text-white'
  return 'bg-green-500 text-white'
}

// ============================================================
// Modal de aviso de validación (solo para peso inusual)
// ============================================================
function ValidationWarning({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-orange-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Verificá este dato</p>
            <p className="text-sm text-gray-600 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 text-sm">Corregir</button>
          <button onClick={onConfirm} className="btn-primary flex-1 text-sm">Guardar igual</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Modal de esfuerzo percibido del día (por cada día)
// ============================================================
function DailyPSEModal({ dayLabel, currentEffort, onSave, onClose }) {
  const [effort, setEffort] = useState(currentEffort ?? null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (effort === null) return
    setSaving(true)
    await onSave(effort, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
        <div className="p-5 space-y-4">
          {/* Encabezado */}
          <div className="text-center">
            <p className="text-3xl mb-1">💪</p>
            <h2 className="font-bold text-gray-900 text-lg">
              ¡{dayLabel} completado!
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              ¿Cómo fue el esfuerzo general de {dayLabel}?
            </p>
          </div>

          {/* Selector PSE 1–10 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 text-center uppercase tracking-wide">
              Esfuerzo percibido — {dayLabel}
            </p>
            <div className="grid grid-cols-5 gap-2">
              {PSE_SHORT.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setEffort(effort === value ? null : value)}
                  className={`rounded-xl p-2 text-center transition-all ${
                    effort === value
                      ? pseColor(value) + ' ring-2 ring-offset-1 ring-current scale-105'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="block text-base font-bold">{value}</span>
                  <span className="block text-[10px] leading-tight mt-0.5">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 px-1">
              <span>😌 Muy fácil</span>
              <span>💀 Máximo</span>
            </div>
          </div>

          {/* Muestra la selección */}
          {effort !== null && (
            <div className={`rounded-xl p-2 text-center text-sm font-medium ${pseColor(effort)}`}>
              PSE {effort} — {PSE_SHORT[effort - 1]?.label}
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Observaciones de {dayLabel} (opcional)
            </label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder={`¿Cómo te fue en ${dayLabel}?`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">
              Omitir
            </button>
            <button
              onClick={handleSave}
              disabled={effort === null || saving}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Guardar'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Tarjeta de ejercicio individual (bloques de fuerza)
// ============================================================
function ExerciseCard({ planEx, log, onSaveLog, onDeleteLog, suggestedSets }) {
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
    log, planExercise: planEx, exercise: exerciseDef,
  })
  const initialUnilateral = getEffectiveUnilateral({
    log, planExercise: planEx, exercise: exerciseDef,
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
      const parsed = fromLog.map(r => r != null ? String(r) : '')
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
      const asStrings = fromLog.map(w => w != null && w !== '' ? String(w) : '')
      if (setsCount > 0 && asStrings.length !== setsCount) {
        return Array.from({ length: setsCount }, (_, i) =>
          asStrings[i] || suggestedWeightsArr[i] || ''
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
    setLogData(p => ({
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
    setLogData(p => ({ ...p, actual_reps_arr: newArr }))
  }

  function handleWeightChange(idx, val) {
    const newArr = [...logData.actual_weights_arr]
    newArr[idx] = val
    setLogData(p => ({ ...p, actual_weights_arr: newArr }))
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
        ...Array.from({ length: n - currentReps.length }, (_, i) =>
          suggestedRepsArr[currentReps.length + i] || ''
        )
      ]
      newWeights = [
        ...currentWeights,
        ...Array.from({ length: n - currentWeights.length }, (_, i) =>
          suggestedWeightsArr[currentWeights.length + i] || ''
        )
      ]
    } else {
      newReps = currentReps.slice(0, n)
      newWeights = currentWeights.slice(0, n)
    }
    setLogData(p => ({ ...p, actual_sets: n.toString(), actual_reps_arr: newReps, actual_weights_arr: newWeights }))
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
    const repsNumeric = repsArrRaw
      .map(r => parseFloat(r))
      .map(n => isNaN(n) ? null : n)

    const weightsArrRaw = logData.actual_weights_arr || []
    const weightsNumeric = weightsArrRaw
      .map(w => parseFloat(w))
      .map(n => isNaN(n) ? null : n)

    // Length de reps determina cuántas series tiene el log.
    // Si bodyweight, anulamos weights enteramente para satisfacer el CHECK
    // (constraint: bodyweight ⇒ actual_weights_jsonb IS NULL).
    const weightsForRpc = isBodyweight
      ? null
      // Igualar largo de weights con reps (rellena con null si faltan)
      : Array.from({ length: repsNumeric.length }, (_, i) =>
          weightsNumeric[i] != null ? weightsNumeric[i] : null
        )

    return {
      // valores que necesita la RPC
      p_reps: repsNumeric,
      p_weights: weightsForRpc,
      p_weight_mode: logData.weight_mode || 'with_weight',
      p_unilateral: !!logData.unilateral,
      p_reps_unit: logData.reps_unit || null,
      p_actual_sets: logData.actual_sets ? parseInt(logData.actual_sets) : (repsNumeric.length || null),
      p_perceived_difficulty: logData.perceived_difficulty || null,
      p_perceived_difficulty_label: logData.perceived_difficulty
        ? PSE_OPTIONS.find(p => p.value === logData.perceived_difficulty)?.label
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
      return { type: 'warning', message: 'No registraste el esfuerzo percibido (PSE). Tu coach lo usa para ajustar el plan.' }
    }
    // Pesos demasiado altos (solo si no es BW)
    if (!isBodyweight && Array.isArray(data.p_weights)) {
      const nums = data.p_weights.filter(w => w != null && !isNaN(w))
      if (nums.some(w => w > 500)) {
        return { type: 'warning', message: 'Algún peso registrado parece muy alto. ¿Son correctos?' }
      }
      // Soft-warning "Solo con barra" + peso > 20kg
      if (data.p_weight_mode === 'barbell_only' && nums.some(w => w > 20)) {
        return { type: 'warning', message: 'Cargaste "Solo con barra" pero el peso supera los 20kg (peso de la barra). ¿Es correcto?' }
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
      setLogData(p => ({ ...p, completed: true }))
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
        actual_reps_arr: setsCount > 0
          ? Array.from({ length: setsCount }, (_, i) => suggestedRepsArr[i] || '')
          : [suggestedRepsArr[0] || ''],
        actual_weights_arr: setsCount > 0
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
          onCancel={() => { setWarning(null); setPendingData(null) }}
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
                  Se borrarán los datos registrados de <strong>{planEx.exercise?.name}</strong>. Esta acción no se puede deshacer.
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
                {deleting
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 size={14} />Sí, desmarcar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-2xl border-2 transition-all overflow-hidden ${
        completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'
      }`}>
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={e => { e.stopPropagation(); if (!completed) setEditing(true) }}
            className="flex-shrink-0"
          >
            {completed
              ? <CheckCircle2 size={24} className="text-green-500" />
              : <Circle size={24} className="text-gray-300" />
            }
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {planEx.block_label && (
                <span className="badge bg-primary-100 text-primary-700 flex-shrink-0">
                  {planEx.block_label}
                </span>
              )}
              <p className={`font-semibold text-sm truncate ${completed ? 'text-green-800' : 'text-gray-900'}`}>
                {planEx.exercise?.name}
              </p>
            </div>
            {/* Sugerido por el coach */}
            <p className="text-xs text-gray-400 mt-0.5">
              Sugerido: {[
                planEx.suggested_sets && `${planEx.suggested_sets} series`,
                suggestedRepsRaw && `× ${displayReps(suggestedRepsRaw)}`,
                planEx.suggested_weight && planEx.suggested_weight !== 'None' && `· ${planEx.suggested_weight}`,
              ].filter(Boolean).join(' ')}
            </p>
            {log && !expanded && (() => {
              const wArr = readLogWeights(log).filter(w => w != null && w !== '')
              const wDisplay = wArr.length > 0 ? `${wArr.join(', ')}kg` : null
              return (
                <p className="text-xs text-green-600 mt-0.5 font-medium">
                  ✓ {[
                    log.actual_sets && `${log.actual_sets}s`,
                    wDisplay,
                    log.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                  ].filter(Boolean).join(' · ')}
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
                onClick={e => e.stopPropagation()}
                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
              >
                <PlayCircle size={18} />
              </a>
            )}
            {expanded ? <ChevronDown size={18} className="text-gray-400 rotate-180" /> : <ChevronDown size={18} className="text-gray-400" />}
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
            {(!completed || editing) ? (
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
                    onChange={e => handleSetsChange(e.target.value)}
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
                        onChange={e => setLogData(p => ({ ...p, weight_mode: e.target.value }))}
                      >
                        {WEIGHT_MODES.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">Unidad reps</label>
                      <select
                        className="input text-xs py-1.5"
                        value={logData.reps_unit || ''}
                        onChange={e => setLogData(p => ({ ...p, reps_unit: e.target.value || null }))}
                      >
                        <option value="">reps (default)</option>
                        {REPS_UNITS.filter(u => u.key !== 'reps').map(u => (
                          <option key={u.key} value={u.key}>{u.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-600"
                      checked={!!logData.unilateral}
                      onChange={e => setLogData(p => ({ ...p, unilateral: e.target.checked }))}
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
                      ? (logData.unilateral ? 'Reps por lado y peso por serie' : 'Repeticiones y peso por serie')
                      : (logData.unilateral ? 'Reps por lado por serie' : 'Repeticiones por serie')}
                  </label>
                  {/* Encabezados */}
                  <div className={`grid gap-1.5 mb-1 px-0.5 ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}>
                    <div />
                    <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                      {logData.unilateral ? 'Reps × lado' : (logData.reps_unit && logData.reps_unit !== 'reps' ? REPS_UNITS.find(u => u.key === logData.reps_unit)?.short || 'Reps' : 'Reps')}
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
                    <div key={i} className={`grid gap-1.5 mb-1.5 items-center ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}>
                      <div className="text-xs text-center text-gray-400 font-medium">{i + 1}</div>
                      <input
                        className="input text-sm text-center"
                        placeholder={suggestedRepsArr[i] || '—'}
                        value={logData.actual_reps_arr[i] || ''}
                        onChange={e => handleRepsChange(i, e.target.value)}
                      />
                      {showWeightInputs && (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="input text-sm text-center"
                          placeholder={suggestedWeightsArr[i] || '0'}
                          value={logData.actual_weights_arr[i] || ''}
                          onChange={e => handleWeightChange(i, e.target.value)}
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
                  {showWeightInputs && logData.weight_mode === 'barbell_only' &&
                    logData.actual_weights_arr.some(w => parseFloat(w) > 20) && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                      <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Marcaste <strong>"Solo con barra"</strong> pero hay pesos &gt; 20kg. La barra olímpica suele pesar 20kg. ¿Querés cambiar a "Con peso"?
                      </p>
                    </div>
                  )}
                </div>

                {/* PSE por ejercicio */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Esfuerzo percibido (PSE)</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        onClick={() => setLogData(p => ({ ...p, perceived_difficulty: p.perceived_difficulty === n ? null : n }))}
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
                    onChange={e => setLogData(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={attemptSave}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><CheckCircle2 size={16} />Marcar como completado</>
                  }
                </button>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-green-700">✓ Completado</p>
                {(() => {
                  const repsArr = readLogReps(log).filter(r => r != null && r !== '')
                  const wArr = readLogWeights(log).filter(w => w != null && w !== '')
                  const repsLabel = log?.unilateral ? ' por lado' : ''
                  const unitLabel = log?.reps_unit && log.reps_unit !== 'reps'
                    ? ` ${log.reps_unit}` : ''
                  return (
                    <p className="text-xs text-green-600">
                      {[
                        log?.actual_sets && `${log.actual_sets} series`,
                        repsArr.length > 0 && `× ${repsArr.join(', ')}${unitLabel}${repsLabel}`,
                        wArr.length > 0 && `${wArr.join(', ')}kg`,
                        log?.weight_mode === 'bodyweight' && wArr.length === 0 && 'sin peso',
                        log?.weight_mode === 'barbell_only' && 'solo barra',
                        log?.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )
                })()}
                {log?.notes && <p className="text-xs text-green-600 italic">"{log.notes}"</p>}
                <div className="flex items-center gap-3 pt-0.5">
                  <button onClick={() => setEditing(true)} className="text-xs text-green-700 underline">
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

// ============================================================
// Bloque STRENGTH colapsable (wrapper con header rico)
// ============================================================
function StrengthBlockRunCard({
  block, strengthIndexInSection, logs, saveLog, deleteLog,
}) {
  const [expanded, setExpanded] = useState(false)

  const exercises = (block.plan_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  const total = exercises.length
  const done = exercises.filter(ex => logs[ex.id]?.completed).length
  const completed = total > 0 && done === total

  // Título del bloque:
  //   - Si el coach le puso título, ese.
  //   - Si hay varios strength en la sección, "Fuerza A/B/C…" (letras).
  //   - Si es el único strength de la sección, simplemente "Fuerza".
  // (El nombre de la sección "Activación" / "Principal Día A" lo da el h2 de arriba.)
  function titleFor() {
    if (block.title) return block.title
    if (strengthIndexInSection > 0) {
      const letter = ['A','B','C','D','E','F','G','H'][strengthIndexInSection] || (strengthIndexInSection + 1)
      return `Fuerza ${letter}`
    }
    return 'Fuerza'
  }

  const title = titleFor()

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden ${
      completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'
    }`}>
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="flex-shrink-0">
          {completed
            ? <CheckCircle2 size={24} className="text-green-500" />
            : <Circle size={24} className="text-gray-300" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">💪</span>
            <p className={`font-semibold text-sm truncate ${completed ? 'text-green-800' : 'text-gray-900'}`}>
              {title}
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {done} / {total} hechos
            {total > 0 && (
              <span className="ml-2 text-gray-400">· {Math.round((done / total) * 100)}%</span>
            )}
          </p>
        </div>
        {/* Mini progress bar */}
        {total > 0 && !expanded && (
          <div className="hidden sm:block w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
            <div
              className={`h-full ${completed ? 'bg-green-500' : 'bg-primary-500'} transition-all`}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        )}
        {expanded
          ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
      </button>

      {/* Body: lista de ejercicios */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
          {exercises.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-3">
              Este bloque todavía no tiene ejercicios.
            </p>
          )}
          {exercises.map(ex => (
            <ExerciseCard
              key={ex.id}
              planEx={ex}
              log={logs[ex.id]}
              onSaveLog={saveLog}
              onDeleteLog={deleteLog}
              suggestedSets={ex.suggested_sets}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Card de Wellbeing diario (siempre visible, opcional)
// ============================================================
function WellbeingCard({ wellbeing, onOpen, isToday }) {
  const completed = !!wellbeing

  // Promedio "ponderado": los positivos cuentan tal cual; los negativos invertidos
  // (10 - val) para que un único score 1–10 represente "mejor estado" cuando es alto.
  let avgScore = null
  if (completed) {
    const scores = []
    for (const m of WELLBEING_METRICS) {
      const v = wellbeing[m.key]
      if (typeof v === 'number') {
        scores.push(m.positive ? v : 11 - v)
      }
    }
    if (scores.length > 0) {
      avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
        completed
          ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
          : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          completed ? 'bg-amber-100' : 'bg-amber-200'
        }`}>
          <span className="text-xl">🌟</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-gray-900">Wellbeing diario</p>
            {completed ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                ✓ Completado
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">
                Pendiente
              </span>
            )}
          </div>

          {completed ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {WELLBEING_METRICS.map(m => {
                const val = wellbeing[m.key]
                if (val == null) return null
                return (
                  <span
                    key={m.key}
                    title={`${m.label}: ${val}/10`}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${wellbeingColor(val, m.positive)}`}
                  >
                    {m.emoji} {val}
                  </span>
                )
              })}
              {avgScore !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 ml-1">
                  promedio {avgScore}/10
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700/90 mt-0.5">
              {isToday
                ? 'Tomate 30 segundos para contar cómo llegás hoy'
                : 'Registrá cómo te sentías ese día (opcional)'}
            </p>
          )}
        </div>

        <ChevronRight size={18} className="text-amber-400 flex-shrink-0" />
      </div>
    </button>
  )
}

// ============================================================
// Render de un bloque (delegador al tipo)
// ============================================================
function BlockRenderer({
  block, strengthIndexInSection,
  logs, blockLog, saveLog, deleteLog, saveBlockLog, deleteBlockLog,
}) {
  if (block.block_type === 'aerobic') {
    return (
      <AerobicBlockRunCard
        block={block}
        blockLog={blockLog}
        onSaveLog={(data) => saveBlockLog(block.id, data)}
        onDeleteLog={() => deleteBlockLog(block.id)}
      />
    )
  }

  if (block.block_type === 'circuit') {
    // Logs por ejercicio del circuito
    const exLogsForBlock = {}
    for (const ex of (block.plan_exercises || [])) {
      if (logs[ex.id]) exLogsForBlock[ex.id] = logs[ex.id]
    }
    return (
      <CircuitBlockRunCard
        block={block}
        blockLog={blockLog}
        exerciseLogs={exLogsForBlock}
        onSaveBlockLog={(data) => saveBlockLog(block.id, data)}
        onSaveExerciseLog={saveLog}
        onDeleteBlockLog={() => deleteBlockLog(block.id)}
      />
    )
  }

  // Strength: card colapsable con lista de ExerciseCard adentro.
  return (
    <StrengthBlockRunCard
      block={block}
      strengthIndexInSection={strengthIndexInSection}
      logs={logs}
      saveLog={saveLog}
      deleteLog={deleteLog}
    />
  )
}

// ============================================================
// Helpers de completado
// ============================================================
function isBlockCompleted(block, logs, blockLogs) {
  if (block.block_type === 'strength') {
    const exs = block.plan_exercises || []
    if (exs.length === 0) return false
    return exs.every(ex => logs[ex.id]?.completed)
  }
  // aerobic / circuit: el estado de completado vive en workout_block_logs
  if (block.__virtual) return false // no debería caer aquí, pero por seguridad
  return !!blockLogs[block.id]?.completed
}

function isSectionCompleted(sectionBlocks, logs, blockLogs) {
  if (!sectionBlocks || sectionBlocks.length === 0) return false
  return sectionBlocks.every(b => isBlockCompleted(b, logs, blockLogs))
}

// ============================================================
// Página principal
// ============================================================
export default function TodayWorkoutPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [planBlocks, setPlanBlocks] = useState([])
  const [logs, setLogs] = useState({})
  const [blockLogs, setBlockLogs] = useState({})
  const [session, setSession] = useState(null)
  // activeDay arranca null: se setea automáticamente al "siguiente día lógico" en la primera carga.
  const [activeDay, setActiveDay] = useState(null)
  // PSE modal por día: null | 'day_a' | 'day_b' | ...
  const [showPSEForDay, setShowPSEForDay] = useState(null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const sessionStartRef = useRef(null)
  // Evitar disparar el modal varias veces en el mismo render
  const pseTriggeredRef = useRef({})
  // Evita re-aplicar el "día sugerido" cada vez que cambia la fecha o se refetchea.
  const dayInitializedRef = useRef(false)
  // Wellbeing
  const [wellbeing, setWellbeing] = useState(null)
  const [showWellbeing, setShowWellbeing] = useState(false)
  // Aviso pasivo (no bloqueante) cuando el alumno empieza a registrar datos
  // sin haber cargado el wellbeing del día. Se muestra una sola vez por día.
  const [showWellbeingStartAviso, setShowWellbeingStartAviso] = useState(false)
  const wellbeingStartAvisoFiredRef = useRef(false)

  // Aviso de error al guardar (PSE, inicio de sesión, etc.). Se setea desde
  // los catch de saveLog / saveBlockLog / saveDayPSE.
  //
  // Diferencia entre errores recuperables y no recuperables (handoff 9.1):
  //   - Recuperable (network / 503 / JWT expirado): auto-close 6s.
  //   - No recuperable (CHECK constraint, RLS, FK, validación back):
  //     banner PERSISTE hasta que el alumno apriete "Entendido".
  //
  // Reemplaza el console.error silencioso previo que dejaba al alumno con la
  // impresión de haber guardado cuando en realidad el back rechazó la operación.
  // Shape: { message: string, persistent: boolean } | null
  const [saveErrorAviso, setSaveErrorAviso] = useState(null)
  const saveErrorTimerRef = useRef(null)

  /**
   * Muestra el banner de error. Acepta varias firmas para mantener
   * compat con los call sites existentes:
   *   showSaveErrorAviso(error)                  → infiere todo del error
   *   showSaveErrorAviso('mensaje custom')       → mensaje fijo, recuperable
   *   showSaveErrorAviso('mensaje custom', err)  → mensaje fijo, persistencia
   *                                                inferida del error
   */
  function showSaveErrorAviso(arg, errOverride) {
    if (saveErrorTimerRef.current) {
      clearTimeout(saveErrorTimerRef.current)
      saveErrorTimerRef.current = null
    }
    let banner
    if (arg && typeof arg === 'object') {
      // Caso 1: nos pasaron el error directo
      banner = buildErrorBanner(arg)
    } else {
      // Caso 2 y 3: mensaje custom (opcionalmente con error para inferir persistencia)
      banner = buildErrorBanner(errOverride || null, arg)
    }
    setSaveErrorAviso(banner)
    if (!banner.persistent) {
      saveErrorTimerRef.current = setTimeout(() => setSaveErrorAviso(null), 6000)
    }
  }

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (profile?.id) fetchWorkout()
  }, [profile, selectedDate])

  // Al cambiar de fecha, resetear los triggers de PSE y de aviso de wellbeing
  useEffect(() => {
    pseTriggeredRef.current = {}
    wellbeingStartAvisoFiredRef.current = false
    setShowWellbeingStartAviso(false)
  }, [selectedDate])

  // started_at ya NO se registra al abrir la página.
  // Se registra cuando el alumno guarda su primer ejercicio o bloque (saveLog / saveBlockLog).

  async function fetchWorkout() {
    setLoading(true)
    try {
      const { data: allActiveAssignments } = await supabase
        .from('plan_assignments')
        .select('*, plan:plans!plan_id(*)')
        .eq('student_id', profile.id)
        .eq('active', true)
        .order('created_at', { ascending: false })

      // Solo tomar planes de entrenamiento, ignorar evaluaciones
      const assignData = (allActiveAssignments || []).find(
        a => !a.plan?.plan_type || a.plan?.plan_type === 'training'
      )

      if (!assignData) { setLoading(false); return }
      setAssignment(assignData)

      const [exercisesRes, blocksRes, logsRes, blockLogsRes, sessionRes, wellbeingRes, recentLogsRes] = await Promise.all([
        supabase
          .from('plan_exercises')
          .select('*, exercise:exercises!exercise_id(*)')
          .eq('plan_id', assignData.plan_id)
          .order('order_index'),
        supabase
          .from('plan_blocks')
          .select('*')
          .eq('plan_id', assignData.plan_id)
          .order('order_index'),
        supabase
          .from('workout_logs')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_block_logs')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate)
          .maybeSingle(),
        supabase
          .from('wellbeing_logs')
          .select('*')
          .eq('user_id', profile.id)
          .eq('date', selectedDate)
          .maybeSingle(),
        // Logs recientes (cualquier fecha) para sugerir el día siguiente al último entrenado.
        // Solo se usa en la primera carga; queries siguientes se descartan vía dayInitializedRef.
        supabase
          .from('workout_logs')
          .select('logged_date, plan_exercise_id')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .order('logged_date', { ascending: false })
          .limit(80),
      ])

      setPlanExercises(exercisesRes.data || [])
      setPlanBlocks(blocksRes.data || [])

      // Sugerir el día siguiente al último entrenado (solo en la primera carga).
      if (!dayInitializedRef.current) {
        const allBlocks = groupExercisesIntoBlocks(exercisesRes.data || [], blocksRes.data || [])
        const sectionsWithContent = new Set(allBlocks.map(b => b.section).filter(Boolean))
        const activeDaysLocal = DAY_SECTION_IDS.filter(id => sectionsWithContent.has(id))
        const exSection = {}
        for (const ex of (exercisesRes.data || [])) {
          exSection[ex.id] = ex.section
        }
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const suggested = suggestNextDay(activeDaysLocal, recentLogsRes.data || [], exSection, todayStr)
        if (suggested) {
          setActiveDay(suggested)
          dayInitializedRef.current = true
        }
      }

      // Round 2a: mergear body de notas mirror sobre el log antes de
      // armar el mapa, para que la textarea muestre la versión panel
      // (que en round 2b será la fuente única tras dropear workout_logs.notes).
      const rawLogs = logsRes.data || []
      const logIds = rawLogs.map(l => l.id)
      const bodiesMap = await fetchSingleMirrorBodies({ contextType: 'workout_log', contextIds: logIds })
      const logsMap = {}
      rawLogs.forEach(log => {
        logsMap[log.plan_exercise_id] = {
          ...log,
          notes: bodiesMap.get(log.id) ?? log.notes ?? '',
        }
      })
      setLogs(logsMap)

      // Mismo patrón que workout_logs: enrich blockLogs con el body
      // desde notes (fuente única tras drop de workout_block_logs.notes en v26d).
      const rawBlockLogs = blockLogsRes.data || []
      const blockLogIds = rawBlockLogs.map(bl => bl.id)
      const blockBodiesMap = await fetchSingleMirrorBodies({ contextType: 'workout_block_log', contextIds: blockLogIds })
      const blockLogsMap = {}
      rawBlockLogs.forEach(bl => {
        blockLogsMap[bl.plan_block_id] = { ...bl, notes: blockBodiesMap.get(bl.id) ?? '' }
      })
      setBlockLogs(blockLogsMap)

      setSession(sessionRes.data)

      // Wellbeing: cargar el estado del día.
      // Importante: NO abrir el modal automáticamente — el alumno lo abre desde
      // la WellbeingCard. Los avisos pasivos al primer save y al terminar
      // el entrenamiento se encargan de recordárselo.
      setWellbeing(wellbeingRes.data || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Crea o actualiza la workout_session para (student, plan, logged_date).
  // IMPORTANTE: si la session no existe, la crea con los datos pasados
  // (típicamente { started_at }). Cumple el contrato del back:
  //   - constraint `sessions_finished_requires_started`: nunca insertar
  //     finished_at sin started_at. Los callers que solo pasan
  //     finished_at deben asegurar que la session ya existe con
  //     started_at (lo hacen saveLog/saveBlockLog antes de saveDayPSE).
  //   - trigger `trg_workout_sessions_block_evaluations`: el plan no
  //     puede ser eval. Filtrado río arriba en fetchAssignment.
  //
  // Tira el error a quien la llame: el catch silencioso previo dejaba
  // al alumno sin feedback cuando el back rechazaba la operación.
  async function upsertSession(data) {
    if (!assignment) return
    const { data: existing, error: selErr } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('student_id', profile.id)
      .eq('plan_id', assignment.plan_id)
      .eq('logged_date', selectedDate)
      .maybeSingle()
    if (selErr) throw selErr

    if (existing) {
      // started_at nunca se sobreescribe: si el registro ya existe, ese valor se preserva
      const { started_at: _ignore, ...safeData } = data

      // finished_at solo se guarda si es estrictamente posterior al started_at original
      // Esto evita duraciones negativas por sesiones cruzadas entre días
      if (safeData.finished_at && existing.started_at) {
        if (new Date(safeData.finished_at) <= new Date(existing.started_at)) {
          delete safeData.finished_at
        }
      }

      const { data: updated, error: updErr } = await supabase
        .from('workout_sessions')
        .update(safeData)
        .eq('id', existing.id)
        .select()
        .single()
      if (updErr) throw updErr
      setSession(updated)
    } else {
      const { data: created, error: insErr } = await supabase
        .from('workout_sessions')
        .insert({
          student_id: profile.id,
          plan_id: assignment.plan_id,
          logged_date: selectedDate,
          logged_late: !isToday,
          ...data,
        })
        .select()
        .single()
      if (insErr) throw insErr
      setSession(created)
    }
  }

  // Dispara el aviso pasivo de wellbeing una sola vez cuando el alumno
  // está cargando datos del día y aún no completó el wellbeing.
  function maybeFireWellbeingStartAviso() {
    if (
      isToday &&
      !wellbeing &&
      !wellbeingStartAvisoFiredRef.current
    ) {
      wellbeingStartAvisoFiredRef.current = true
      setShowWellbeingStartAviso(true)
      setTimeout(() => setShowWellbeingStartAviso(false), 6000)
    }
  }

  // Guarda un workout_log vía RPC save_workout_log.
  // Nota importante: la RPC ya hace doble escritura interna a las columnas
  // viejas (actual_reps, actual_weights, actual_weight) en formato JSON limpio,
  // así que el front no necesita doblar nada.
  //
  // El `data` viene de buildSaveData() con todos los p_* listos.
  async function saveLog(planExerciseId, data) {
    const existingLog = logs[planExerciseId]

    // Garantizar workout_session antes de la escritura (idem que antes,
    // ver comentario original). started_at representa "el alumno está
    // cargando ahora", coherente con el backfill del back.
    if (assignment && !session?.started_at) {
      try {
        await upsertSession({ started_at: new Date().toISOString() })
      } catch (err) {
        console.error('saveLog: upsertSession error:', err)
        showSaveErrorAviso('No pudimos registrar el inicio de la sesión. Intentá guardar de nuevo.', err)
        throw err
      }
    }

    // Aviso de wellbeing pendiente al primer registro del día (no bloqueante)
    maybeFireWellbeingStartAviso()

    // Extraemos el body de la nota del data ANTES de armar los rpcArgs:
    // el ExerciseCard (strength) y CircuitBlockRunCard meten el texto del
    // alumno en _noteBody. Underscore-prefijado para que no se confunda
    // con los p_* que sí van a la RPC.
    const { _noteBody, ...rpcData } = data || {}

    // Llamada a la RPC. Si existingLog → UPDATE (p_log_id), sino INSERT.
    const rpcArgs = {
      p_log_id: existingLog?.id ?? null,
      p_student_id: profile.id,
      p_plan_id: assignment.plan_id,
      p_plan_exercise_id: planExerciseId,
      p_logged_date: selectedDate,
      p_logged_late: !isToday,
      ...rpcData, // p_reps, p_weights, p_weight_mode, p_unilateral, p_reps_unit,
                  // p_actual_sets, p_perceived_difficulty, p_notes=null, p_completed
    }

    const { data: returnedId, error } = await supabase.rpc('save_workout_log', rpcArgs)
    if (error) {
      console.error('saveLog: rpc save_workout_log error:', error)
      // El helper clasifica por código (23514 / 23503 / 42501 / etc.) y
      // arma mensaje + persistencia. CHECK violations quedan visibles
      // hasta que el alumno las lea (handoff 9.1).
      showSaveErrorAviso(error)
      throw error
    }

    // Refetch del log completo (la RPC devuelve solo el uuid)
    const logId = existingLog?.id ?? returnedId
    if (logId) {
      // Round 2b (handoff m26→m27): la columna workout_logs.notes se dropeó.
      // Persistimos el body del alumno como mirror en public.notes via
      // postWorkoutLogNote. Si _noteBody viene vacío y existía mirror,
      // la función hace soft-delete automáticamente.
      const { error: noteErr } = await postWorkoutLogNote({
        studentId: profile.id,
        logId,
        body: _noteBody || '',
      })
      if (noteErr) {
        // eslint-disable-next-line no-console
        console.warn('[saveLog] no se pudo guardar la nota del log en el panel:', noteErr)
      }

      const { data: fullLog } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('id', logId)
        .single()
      if (fullLog) {
        // Leemos el body desde el mirror del panel (fuente única post v26d).
        const bodiesMap = await fetchSingleMirrorBodies({ contextType: 'workout_log', contextIds: [logId] })
        fullLog.notes = bodiesMap.get(logId) ?? ''
        setLogs(prev => ({ ...prev, [planExerciseId]: fullLog }))
      }
    }
  }

  async function deleteLog(planExerciseId) {
    const existingLog = logs[planExerciseId]
    if (!existingLog) return
    const { error } = await supabase
      .from('workout_logs')
      .delete()
      .eq('id', existingLog.id)
    if (error) throw error
    setLogs(prev => {
      const next = { ...prev }
      delete next[planExerciseId]
      return next
    })
  }

  async function saveBlockLog(planBlockId, data) {
    // Bloques virtuales (legacy sin block_id en DB) no se persisten
    if (typeof planBlockId === 'string' && planBlockId.startsWith('virtual-')) {
      console.warn('Intento de guardar log de bloque virtual, ignorado:', planBlockId)
      return
    }

    // Garantizar workout_session también para bloques retroactivos (idem
    // saveLog). Ver comentario allí: el back exige started_at antes que
    // cualquier finished_at, y dejar workout_block_logs huérfanos rompe
    // las mismas métricas que workout_logs huérfanos.
    if (assignment && !session?.started_at) {
      try {
        await upsertSession({ started_at: new Date().toISOString() })
      } catch (err) {
        console.error('saveBlockLog: upsertSession error:', err)
        showSaveErrorAviso('No pudimos registrar el inicio de la sesión. Intentá guardar de nuevo.', err)
        throw err
      }
    }

    // Aviso de wellbeing pendiente al primer registro del día (no bloqueante)
    maybeFireWellbeingStartAviso()

    // La columna workout_block_logs.notes se dropeó en v26d.
    // Extraemos `notes` del data y la persistimos como mirror en el panel
    // después del save exitoso, igual que hace saveLog para workout_logs.
    const { notes: bodyForPanel, ...dataForDb } = data || {}

    const existing = blockLogs[planBlockId]
    let result
    if (existing) {
      result = await supabase
        .from('workout_block_logs')
        .update({ ...dataForDb, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('workout_block_logs')
        .insert({
          ...dataForDb,
          student_id: profile.id,
          plan_id: assignment.plan_id,
          plan_block_id: planBlockId,
          logged_date: selectedDate,
          logged_late: !isToday,
        })
        .select()
        .single()
    }
    if (result.error) {
      console.error('saveBlockLog: workout_block_logs error:', result.error)
      // El helper decide si persiste o auto-cierra según el código.
      showSaveErrorAviso(result.error)
      throw result.error
    }

    // Persistir la nota del bloque al panel (round 2b: fuente única tras
    // dropear workout_block_logs.notes). Si bodyForPanel viene vacío y
    // existía mirror, la función hace soft-delete.
    const blockLogId = result.data?.id
    if (blockLogId) {
      const { error: noteErr } = await postWorkoutBlockLogNote({
        studentId: profile.id,
        blockLogId,
        body: bodyForPanel || '',
      })
      if (noteErr) {
        // eslint-disable-next-line no-console
        console.warn('[saveBlockLog] no se pudo guardar la nota del bloque en el panel:', noteErr)
      }
    }

    // Enriquecer el blockLog con el body para que el componente lo muestre sin reload
    const enrichedBlockLog = { ...result.data, notes: bodyForPanel || '' }
    setBlockLogs(prev => ({ ...prev, [planBlockId]: enrichedBlockLog }))
  }

  async function deleteBlockLog(planBlockId) {
    const existing = blockLogs[planBlockId]
    if (!existing) return
    const { error } = await supabase
      .from('workout_block_logs')
      .delete()
      .eq('id', existing.id)
    if (error) throw error
    setBlockLogs(prev => {
      const next = { ...prev }
      delete next[planBlockId]
      return next
    })
  }

  // ====================================================
  // Agrupar bloques con sus ejercicios y por sección
  // ====================================================
  const blocksBySection = useMemo(() => {
    const all = groupExercisesIntoBlocks(planExercises, planBlocks)
    const bySection = {}
    for (const b of all) {
      if (!b.section) continue
      if (!bySection[b.section]) bySection[b.section] = []
      bySection[b.section].push(b)
    }
    Object.values(bySection).forEach(arr =>
      arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    )
    return bySection
  }, [planExercises, planBlocks])

  // Días que tienen contenido (incluye activación como sección aparte)
  const activeDays = useMemo(
    () => DAY_SECTION_IDS.filter(id => (blocksBySection[id] || []).length > 0),
    [blocksBySection]
  )

  // Si el día activo ya no existe (cambió el plan), ir al primero disponible.
  // Importante: si activeDay todavía es null, NO setearlo acá — lo hace fetchWorkout con suggestNextDay.
  useEffect(() => {
    if (activeDay !== null && activeDays.length > 0 && !activeDays.includes(activeDay)) {
      setActiveDay(activeDays[0])
    }
  }, [activeDays, activeDay])

  // Índice de strength por sección (para numeración "Fuerza 2")
  function strengthIndexMap(sectionId) {
    const blocks = blocksBySection[sectionId] || []
    let idx = 0
    const map = {}
    for (const b of blocks) {
      if (b.block_type === 'strength') {
        map[b.id] = idx
        idx += 1
      }
    }
    return map
  }

  // Guardar PSE del día. Borg/efforto va a `borg_per_day` (jsonb en
  // workout_sessions); la observación textual va al panel de notas
  // (Fase D step 2, v26b) — antes se guardaba como key `${day}_notes`
  // dentro del mismo jsonb y quedaba enterrada sin que nadie la leyera.
  async function saveDayPSE(day, effortScale, effortNotes) {
    const currentPerDay = session?.borg_per_day || {}
    const newPerDay = {
      ...currentPerDay,
      [day]: effortScale,
      // (legacy removido) — la observación va al panel via postPSEDayNote
    }
    // finished_at se marca siempre que el alumno cierre el PSE del día que entrenó.
    // En la práctica una sesión = un día calendario = un día del plan, así que tratar
    // de esperar al "último día del plan" dejaba sin hora de fin a los planes con
    // varios días (day_a, day_b, ...). upsertSession ya valida que finished_at sea
    // estrictamente posterior al started_at original, así que es seguro escribirlo
    // siempre (incluso al editar el PSE más tarde).
    //
    // Defensa adicional: si por alguna razón no existe session todavía
    // (caso raro tras los fixes de saveLog/saveBlockLog), insertamos
    // started_at = now() para cumplir la constraint del back que exige
    // started_at antes que cualquier finished_at.
    const payload = {
      borg_per_day: newPerDay,
      finished_at: new Date().toISOString(),
    }
    if (!session?.started_at) {
      payload.started_at = new Date().toISOString()
    }
    try {
      await upsertSession(payload)

      // Si el alumno escribió observación del día, publicarla en el panel
      // como nota libre con note_date = la fecha de la sesión + prefijo
      // del día (ej: "[Día A] me sentí bien"). El error del posteo no
      // rompe el flujo: el PSE/scale ya se guardó.
      if (effortNotes && effortNotes.trim() && profile?.id && session?.logged_date) {
        const dayLabel = DAY_SHORT_LABELS[day] || SECTION_LABELS[day] || 'Día'
        const { error: noteErr } = await postPSEDayNote({
          studentId: profile.id,
          sessionLoggedDate: session.logged_date,
          dayLabel,
          body: effortNotes,
        })
        if (noteErr) {
          // eslint-disable-next-line no-console
          console.warn('[saveDayPSE] no se pudo publicar la nota en el panel:', noteErr)
        }
      }

      pseTriggeredRef.current[day] = true
      setShowPSEForDay(null)
    } catch (err) {
      console.error('saveDayPSE error:', err)
      showSaveErrorAviso('No pudimos guardar tu PSE del día. Probá de nuevo en un momento.', err)
      // No cerramos el modal: dejamos que el alumno reintente sin perder lo que cargó.
    }
  }

  // Activación completa (si no hay activación, se considera completa)
  const activationBlocks = blocksBySection.activation || []
  const activationDone =
    activationBlocks.length === 0 ||
    isSectionCompleted(activationBlocks, logs, blockLogs)

  // Mapa día → completado (requiere activación + todos los bloques del día)
  const dayDoneMap = useMemo(() => {
    const m = {}
    for (const id of activeDays) {
      const sectionDone = isSectionCompleted(blocksBySection[id] || [], logs, blockLogs)
      // El primer día exige también que activación esté completa
      const gate = id === activeDays[0] ? activationDone : true
      m[id] = sectionDone && gate
    }
    return m
  }, [activeDays, blocksBySection, logs, blockLogs, activationDone])

  // PSE guardados en la sesión
  const borgPerDay = session?.borg_per_day || {}

  // Totales para progress bar (cuenta unidades: ejercicios de fuerza + bloques aero/circuito)
  const { completedCount, totalCount } = useMemo(() => {
    let done = 0, total = 0
    for (const section of Object.keys(blocksBySection)) {
      for (const block of blocksBySection[section]) {
        if (block.block_type === 'strength') {
          const exs = block.plan_exercises || []
          total += exs.length
          done += exs.filter(ex => logs[ex.id]?.completed).length
        } else {
          total += 1
          if (blockLogs[block.id]?.completed) done += 1
        }
      }
    }
    return { completedCount: done, totalCount: total }
  }, [blocksBySection, logs, blockLogs])

  // Disparar modal PSE cuando se completa un día (dinámico)
  useEffect(() => {
    if (loading || showPSEForDay !== null) return
    for (const id of activeDays) {
      if (
        dayDoneMap[id] &&
        borgPerDay[id] === undefined &&
        !pseTriggeredRef.current[id]
      ) {
        pseTriggeredRef.current[id] = true
        setShowPSEForDay(id)
        return
      }
    }
  }, [loading, dayDoneMap, borgPerDay, activeDays, showPSEForDay])

  // Fecha máxima permitida: hoy
  const maxDate = format(new Date(), 'yyyy-MM-dd')

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!assignment) return (
    <div className="max-w-lg mx-auto px-4 pt-8 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Dumbbell className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Sin plan asignado</h2>
      <p className="text-gray-500 text-sm">Tu coach todavía no te asignó un plan de entrenamiento.</p>
    </div>
  )

  const hasMultipleDays = activeDays.length > 1
  const activationStrengthMap = strengthIndexMap('activation')
  const activeDayStrengthMap = strengthIndexMap(activeDay)

  return (
    <>
      {/* Modal Wellbeing — aparece al abrir el entrenamiento si no se llenó hoy */}
      {showWellbeing && (
        <WellbeingModal
          userId={profile.id}
          date={selectedDate}
          onSave={(data) => {
            setWellbeing(data)
            setShowWellbeing(false)
          }}
          onSkip={() => setShowWellbeing(false)}
        />
      )}

      {/* Modal PSE del día activo */}
      {showPSEForDay && (
        <DailyPSEModal
          dayLabel={DAY_SHORT_LABELS[showPSEForDay] || SECTION_LABELS[showPSEForDay] || 'Día'}
          currentEffort={borgPerDay[showPSEForDay] ?? null}
          onSave={(effort, notes) => saveDayPSE(showPSEForDay, effort, notes)}
          onClose={() => {
            pseTriggeredRef.current[showPSEForDay] = true
            setShowPSEForDay(null)
          }}
        />
      )}

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-6">
          <p className="text-primary-200 text-sm capitalize">
            {format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <h1 className="text-xl font-bold text-white mt-1">{assignment.plan?.title}</h1>

          {/* Timestamps */}
          {session?.started_at && (
            <div className="flex items-center gap-3 mt-2 text-primary-200 text-xs">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Inicio: {format(new Date(session.started_at), 'HH:mm')}
              </span>
              {session.finished_at && (
                <>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    Fin: {format(new Date(session.finished_at), 'HH:mm')}
                  </span>
                  <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 font-semibold text-white">
                    {Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000)} min
                  </span>
                </>
              )}
            </div>
          )}

          {/* PSE por día registrado */}
          {activeDays.some(id => borgPerDay[id] !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeDays.filter(id => borgPerDay[id] !== undefined).map(id => (
                <div key={id} className="flex items-center gap-1.5">
                  <span className="text-primary-200 text-xs">{DAY_SHORT_LABELS[id]}:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}>
                    PSE {borgPerDay[id]}
                  </span>
                  <button
                    onClick={() => setShowPSEForDay(id)}
                    className="text-primary-300 text-xs underline"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-primary-200 text-xs">{completedCount} / {totalCount} unidades</span>
              <span className="text-primary-200 text-xs">{Math.round(completedCount / Math.max(totalCount, 1) * 100)}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${completedCount / Math.max(totalCount, 1) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Selector de fecha */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              className="input text-sm flex-1"
              value={selectedDate}
              max={maxDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
            />
            {!isToday && (
              <span className="badge bg-orange-100 text-orange-700 text-xs">Editando pasado</span>
            )}
          </div>

          {/* Selector de día (tabs) — dinámico 2..7 */}
          {hasMultipleDays && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {activeDays.map(id => {
                const isDone = dayDoneMap[id]
                const hasPSE = borgPerDay[id] !== undefined
                return (
                  <button
                    key={id}
                    onClick={() => setActiveDay(id)}
                    className={`flex-1 min-w-[70px] py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeDay === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {DAY_SHORT_LABELS[id]}
                    {isDone && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasPSE ? 'bg-green-400' : 'bg-orange-400'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Wellbeing diario — siempre visible como módulo */}
          <WellbeingCard
            wellbeing={wellbeing}
            isToday={isToday}
            onOpen={() => setShowWellbeing(true)}
          />

          {/* Aviso pasivo: aparece la primera vez que el alumno guarda datos
              sin haber cargado el wellbeing. Se auto-cierra a los ~6s y
              nunca bloquea la pantalla. */}
          {showWellbeingStartAviso && !wellbeing && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 flex-1 leading-relaxed">
                <strong>Recordá:</strong> aún no cargaste tu wellbeing de hoy. Podés hacerlo desde la tarjeta de arriba cuando quieras.
              </p>
            </div>
          )}

          {/* Aviso de error al guardar: se muestra cuando alguna operación de
              save falla (upsertSession, workout_logs, workout_block_logs).
              Antes la falla quedaba como console.error silencioso, así que el
              alumno creía haber guardado cuando el back rechazaba la operación
              (p. ej. el PSE retroactivo violando la constraint
              sessions_finished_requires_started). Auto-cierra a los ~6s. */}
          {saveErrorAviso && (
            <div className={`rounded-xl p-3 flex items-start gap-2 ${
              saveErrorAviso.persistent
                ? 'bg-rose-100 border-2 border-rose-300 shadow-sm'
                : 'bg-rose-50 border-2 border-rose-200'
            }`}>
              <AlertTriangle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <p className="text-xs text-rose-800">
                  {saveErrorAviso.message}
                </p>
                {saveErrorAviso.persistent && (
                  <button
                    onClick={() => setSaveErrorAviso(null)}
                    className="mt-2 text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg transition"
                  >
                    Entendido
                  </button>
                )}
              </div>
              {!saveErrorAviso.persistent && (
                <button
                  onClick={() => setSaveErrorAviso(null)}
                  className="text-rose-500 hover:text-rose-700 flex-shrink-0"
                  aria-label="Cerrar aviso"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {/* Activación */}
          {activationBlocks.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {SECTION_EMOJIS.activation} {SECTION_LABELS.activation}
              </h2>
              <div className="space-y-2">
                {activationBlocks.map(block => (
                  <BlockRenderer
                    key={block.id}
                    block={block}
                    strengthIndexInSection={activationStrengthMap[block.id] ?? 0}
                    logs={logs}
                    blockLog={blockLogs[block.id]}
                    saveLog={saveLog}
                    deleteLog={deleteLog}
                    saveBlockLog={saveBlockLog}
                    deleteBlockLog={deleteBlockLog}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Día activo */}
          {(blocksBySection[activeDay] || []).length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {SECTION_EMOJIS[activeDay] || '🏋️'} {SECTION_LABELS[activeDay] || 'Día'}
              </h2>
              <div className="space-y-2">
                {(blocksBySection[activeDay] || []).map(block => (
                  <BlockRenderer
                    key={block.id}
                    block={block}
                    strengthIndexInSection={activeDayStrengthMap[block.id] ?? 0}
                    logs={logs}
                    blockLog={blockLogs[block.id]}
                    saveLog={saveLog}
                    deleteLog={deleteLog}
                    saveBlockLog={saveBlockLog}
                    deleteBlockLog={deleteBlockLog}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Banner de completado por día (dinámico) */}
          {activeDays.map(id => {
            if (!dayDoneMap[id]) return null
            const isLast = id === activeDays[activeDays.length - 1]
            const showAll = activeDays.every(d => dayDoneMap[d])
            const isFinalBanner = isLast && showAll
            return (
              <div
                key={id}
                className={`card text-center py-4 ${
                  isFinalBanner
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
              >
                <p className="text-white font-bold">
                  {isFinalBanner
                    ? '🎉 ¡Entrenamiento completo!'
                    : `✅ ${DAY_SHORT_LABELS[id]} completado`}
                </p>
                {/* Aviso pasivo de wellbeing al cerrar el día (sin botón) */}
                {isFinalBanner && isToday && !wellbeing && (
                  <p className="text-white/90 text-xs mt-1.5">
                    ⚠️ No cargaste tu wellbeing de hoy
                  </p>
                )}
                {borgPerDay[id] !== undefined ? (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}>
                      PSE {borgPerDay[id]}
                    </span>
                    <button
                      onClick={() => setShowPSEForDay(id)}
                      className="text-white/70 text-xs underline"
                    >
                      Editar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPSEForDay(id)}
                    className="mt-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition"
                  >
                    Registrar esfuerzo {DAY_SHORT_LABELS[id]}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
