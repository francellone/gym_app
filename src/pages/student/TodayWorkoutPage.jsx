import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  Dumbbell, PlayCircle, Info,
  Calendar, AlertTriangle, Clock, Lock, Trash2
} from 'lucide-react'
import { borgColor, parseReps, serializeReps, displayReps } from '../../utils/planHelpers'

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
// Tarjeta de ejercicio individual
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

  // Peso sugerido como valor numérico pre-rellenable
  const defaultWeight = parseSuggestedWeight(planEx.suggested_weight)

  // Inicializar reps con valores sugeridos si no hay log previo
  const initRepsArr = () => {
    if (log?.actual_reps) {
      const parsed = parseReps(log.actual_reps)
      if (setsCount > 0 && parsed.length !== setsCount) {
        return Array.from({ length: setsCount }, (_, i) => parsed[i] || suggestedRepsArr[i] || '')
      }
      return parsed
    }
    return setsCount > 0
      ? Array.from({ length: setsCount }, (_, i) => suggestedRepsArr[i] || '')
      : [suggestedRepsArr[0] || '']
  }

  const [logData, setLogData] = useState({
    // Series: pre-rellenado con el valor sugerido por el coach
    actual_sets: log?.actual_sets?.toString() || (setsCount > 0 ? setsCount.toString() : ''),
    actual_reps_arr: initRepsArr(),
    // Peso: pre-rellenado con el peso sugerido por el coach
    actual_weight: log?.actual_weight?.toString() || defaultWeight,
    perceived_difficulty: log?.perceived_difficulty || null,
    notes: log?.notes || '',
    completed: log?.completed || false,
  })

  const completed = logData.completed

  function handleRepsChange(idx, val) {
    const newArr = [...logData.actual_reps_arr]
    newArr[idx] = val
    setLogData(p => ({ ...p, actual_reps_arr: newArr }))
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
    let newReps
    if (n === 0) {
      newReps = ['']
    } else if (n > currentReps.length) {
      // Al agregar series, pre-rellenar con reps sugeridas si las hay
      newReps = [
        ...currentReps,
        ...Array.from({ length: n - currentReps.length }, (_, i) =>
          suggestedRepsArr[currentReps.length + i] || ''
        )
      ]
    } else {
      newReps = currentReps.slice(0, n)
    }
    setLogData(p => ({ ...p, actual_sets: n.toString(), actual_reps_arr: newReps }))
  }

  function buildSaveData() {
    return {
      actual_sets: logData.actual_sets ? parseInt(logData.actual_sets) : null,
      actual_reps: serializeReps(logData.actual_reps_arr) || null,
      actual_weight: logData.actual_weight ? parseFloat(logData.actual_weight) : null,
      perceived_difficulty: logData.perceived_difficulty || null,
      perceived_difficulty_label: logData.perceived_difficulty
        ? PSE_OPTIONS.find(p => p.value === logData.perceived_difficulty)?.label
        : null,
      notes: logData.notes || null,
      completed: true,
    }
  }

  function validate(data) {
    // Avisar si no se registró el PSE
    if (!data.perceived_difficulty) {
      return `No registraste el esfuerzo percibido (PSE). Tu coach lo usa para ajustar el plan.`
    }
    // Solo validar peso inusual — las series ya tienen tope duro
    if (data.actual_weight && data.actual_weight > 500) {
      return `Peso registrado (${data.actual_weight}kg) parece muy alto. ¿Es correcto?`
    }
    return null
  }

  async function attemptSave() {
    const data = buildSaveData()
    const msg = validate(data)
    if (msg) {
      setPendingData(data)
      setWarning(msg)
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
        actual_weight: defaultWeight,
        perceived_difficulty: null,
        notes: '',
        completed: false,
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
            {log && !expanded && (
              <p className="text-xs text-green-600 mt-0.5 font-medium">
                ✓ {[
                  log.actual_sets && `${log.actual_sets}s`,
                  log.actual_weight && `${log.actual_weight}kg`,
                  log.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
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

                {/* Series + Peso */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Series con tope duro */}
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

                  {/* Peso pre-rellenado con sugerido del coach */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Peso (kg)
                      {defaultWeight && (
                        <span className="ml-1 text-primary-500 font-normal">· sug. {defaultWeight}</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input text-sm text-center w-full"
                      placeholder={defaultWeight || '0'}
                      value={logData.actual_weight}
                      onChange={e => setLogData(p => ({ ...p, actual_weight: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Reps por serie: pre-rellenadas con sugerido */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium">
                    Repeticiones por serie
                    {suggestedRepsRaw && (
                      <span className="ml-2 text-gray-400 font-normal">
                        (sugerido: {displayReps(suggestedRepsRaw)})
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Array.from({ length: actualSetsCount }, (_, i) => (
                      <div key={i} className="space-y-1">
                        <div className="text-xs text-center text-gray-400">Serie {i + 1}</div>
                        {suggestedRepsArr[i] && (
                          <div className="text-xs text-center text-primary-600 font-medium">
                            Sug: {suggestedRepsArr[i]}
                          </div>
                        )}
                        <input
                          className="input text-sm text-center"
                          placeholder={suggestedRepsArr[i] || '—'}
                          value={logData.actual_reps_arr[i] || ''}
                          onChange={e => handleRepsChange(i, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
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
                <p className="text-xs text-green-600">
                  {[
                    log?.actual_sets && `${log.actual_sets} series`,
                    log?.actual_reps && `× ${displayReps(log.actual_reps)}`,
                    log?.actual_weight && `${log.actual_weight}kg`,
                    log?.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                  ].filter(Boolean).join(' · ')}
                </p>
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
// Página principal
// ============================================================
export default function TodayWorkoutPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [logs, setLogs] = useState({})
  const [session, setSession] = useState(null)
  const [activeDay, setActiveDay] = useState('day_a')
  // PSE modal por día: null | 'day_a' | 'day_b'
  const [showPSEForDay, setShowPSEForDay] = useState(null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const sessionStartRef = useRef(null)
  // Evitar disparar el modal varias veces en el mismo render
  const pseTriggeredRef = useRef({ day_a: false, day_b: false })

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (profile?.id) fetchWorkout()
  }, [profile, selectedDate])

  // Al cambiar de fecha, resetear los triggers de PSE
  useEffect(() => {
    pseTriggeredRef.current = { day_a: false, day_b: false }
  }, [selectedDate])

  // Registrar inicio de sesión al montar (solo si es hoy)
  useEffect(() => {
    if (isToday && assignment && !session?.started_at) {
      sessionStartRef.current = new Date().toISOString()
      upsertSession({ started_at: sessionStartRef.current })
    }
  }, [assignment, isToday])

  async function fetchWorkout() {
    setLoading(true)
    try {
      const { data: assignData } = await supabase
        .from('plan_assignments')
        .select('*, plan:plans!plan_id(*)')
        .eq('student_id', profile.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!assignData) { setLoading(false); return }
      setAssignment(assignData)

      const [exercisesRes, logsRes, sessionRes] = await Promise.all([
        supabase
          .from('plan_exercises')
          .select('*, exercise:exercises!exercise_id(*)')
          .eq('plan_id', assignData.plan_id)
          .order('order_index'),
        supabase
          .from('workout_logs')
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
      ])

      setPlanExercises(exercisesRes.data || [])

      const logsMap = {}
      ;(logsRes.data || []).forEach(log => { logsMap[log.plan_exercise_id] = log })
      setLogs(logsMap)
      setSession(sessionRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function upsertSession(data) {
    if (!assignment) return
    try {
      const { data: existing } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('student_id', profile.id)
        .eq('plan_id', assignment.plan_id)
        .eq('logged_date', selectedDate)
        .maybeSingle()

      if (existing) {
        const { data: updated } = await supabase
          .from('workout_sessions')
          .update(data)
          .eq('id', existing.id)
          .select()
          .single()
        setSession(updated)
      } else {
        const { data: created } = await supabase
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
        setSession(created)
      }
    } catch (err) {
      console.error('Session upsert error:', err)
    }
  }

  async function saveLog(planExerciseId, data) {
    const existingLog = logs[planExerciseId]
    let result

    if (existingLog) {
      result = await supabase
        .from('workout_logs')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existingLog.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('workout_logs')
        .insert({
          ...data,
          student_id: profile.id,
          plan_id: assignment.plan_id,
          plan_exercise_id: planExerciseId,
          logged_date: selectedDate,
          logged_late: !isToday,
        })
        .select()
        .single()
    }

    if (result.error) throw result.error
    setLogs(prev => ({ ...prev, [planExerciseId]: result.data }))
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

  // Guardar PSE del día en borg_per_day (JSONB en workout_sessions)
  async function saveDayPSE(day, effortScale, effortNotes) {
    const currentPerDay = session?.borg_per_day || {}
    const newPerDay = {
      ...currentPerDay,
      [day]: effortScale,
      ...(effortNotes ? { [`${day}_notes`]: effortNotes } : {}),
    }
    // Si es el último día completado, también marcar finished_at
    const isLastDay = !hasMultipleDays || (day === 'day_b')
    await upsertSession({
      borg_per_day: newPerDay,
      ...(isLastDay ? { finished_at: new Date().toISOString() } : {}),
    })
    pseTriggeredRef.current[day] = true
    setShowPSEForDay(null)
  }

  // Secciones de ejercicios
  const sections = {
    activation: planExercises.filter(e => e.section === 'activation'),
    day_a: planExercises.filter(e => e.section === 'day_a'),
    day_b: planExercises.filter(e => e.section === 'day_b'),
  }

  const hasMultipleDays = sections.day_b.length > 0

  // Lógica de completado por día
  const activationDone =
    sections.activation.length === 0 ||
    sections.activation.every(ex => logs[ex.id]?.completed)

  const dayADone =
    sections.day_a.length > 0 &&
    activationDone &&
    sections.day_a.every(ex => logs[ex.id]?.completed)

  const dayBDone =
    sections.day_b.length > 0 &&
    sections.day_b.every(ex => logs[ex.id]?.completed)

  // Totales para progress bar
  const completedCount = Object.values(logs).filter(l => l.completed).length
  const totalCount = planExercises.length

  // PSE guardados en la sesión
  const borgPerDay = session?.borg_per_day || {}

  // Disparar modal PSE cuando se completa el Día A
  useEffect(() => {
    if (
      !loading &&
      dayADone &&
      borgPerDay.day_a === undefined &&
      !pseTriggeredRef.current.day_a &&
      showPSEForDay === null
    ) {
      pseTriggeredRef.current.day_a = true
      setShowPSEForDay('day_a')
    }
  }, [dayADone, loading])

  // Disparar modal PSE cuando se completa el Día B
  useEffect(() => {
    if (
      !loading &&
      dayBDone &&
      borgPerDay.day_b === undefined &&
      !pseTriggeredRef.current.day_b &&
      showPSEForDay === null
    ) {
      pseTriggeredRef.current.day_b = true
      setShowPSEForDay('day_b')
    }
  }, [dayBDone, loading])

  // Fecha máxima permitida: hoy
  const maxDate = format(new Date(), 'yyyy-MM-dd')

  // Labels de días para el modal
  const DAY_LABELS = { day_a: 'Día A', day_b: 'Día B' }

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

  return (
    <>
      {/* Modal PSE del día activo */}
      {showPSEForDay && (
        <DailyPSEModal
          dayLabel={DAY_LABELS[showPSEForDay]}
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
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  Fin: {format(new Date(session.finished_at), 'HH:mm')}
                </span>
              )}
            </div>
          )}

          {/* PSE por día registrado */}
          {(borgPerDay.day_a !== undefined || borgPerDay.day_b !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {borgPerDay.day_a !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-primary-200 text-xs">Día A:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay.day_a)}`}>
                    PSE {borgPerDay.day_a}
                  </span>
                  <button
                    onClick={() => setShowPSEForDay('day_a')}
                    className="text-primary-300 text-xs underline"
                  >
                    Editar
                  </button>
                </div>
              )}
              {borgPerDay.day_b !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-primary-200 text-xs">Día B:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay.day_b)}`}>
                    PSE {borgPerDay.day_b}
                  </span>
                  <button
                    onClick={() => setShowPSEForDay('day_b')}
                    className="text-primary-300 text-xs underline"
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-primary-200 text-xs">{completedCount} / {totalCount} ejercicios</span>
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

          {/* Selector de día (tabs) */}
          {hasMultipleDays && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[
                { id: 'day_a', label: 'Día A' },
                { id: 'day_b', label: 'Día B' },
              ].filter(d => sections[d.id].length > 0).map(d => {
                const isDone = d.id === 'day_a' ? dayADone : dayBDone
                const hasPSE = borgPerDay[d.id] !== undefined
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveDay(d.id)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeDay === d.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {d.label}
                    {isDone && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasPSE ? 'bg-green-400' : 'bg-orange-400'}`} />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Activación */}
          {sections.activation.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">🔥 Activación</h2>
              <div className="space-y-2">
                {sections.activation.map(ex => (
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
            </div>
          )}

          {/* Día activo */}
          {sections[activeDay]?.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {activeDay === 'day_a' ? '💪 Principal Día A' : '🏋️ Principal Día B'}
              </h2>
              <div className="space-y-2">
                {sections[activeDay].map(ex => (
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
            </div>
          )}

          {/* Banner de completado por día */}
          {dayADone && (
            <div className={`card text-center py-4 ${
              hasMultipleDays
                ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                : 'bg-gradient-to-r from-green-500 to-emerald-500'
            }`}>
              <p className="text-white font-bold">
                {hasMultipleDays ? '✅ Día A completado' : '🎉 ¡Entrenamiento completo!'}
              </p>
              {borgPerDay.day_a !== undefined ? (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay.day_a)}`}>
                    PSE {borgPerDay.day_a}
                  </span>
                  <button
                    onClick={() => setShowPSEForDay('day_a')}
                    className="text-white/70 text-xs underline"
                  >
                    Editar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPSEForDay('day_a')}
                  className="mt-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition"
                >
                  Registrar esfuerzo Día A
                </button>
              )}
            </div>
          )}

          {dayBDone && (
            <div className="card bg-gradient-to-r from-green-500 to-emerald-500 text-center py-4">
              <p className="text-white font-bold">🎉 ¡Entrenamiento completo!</p>
              {borgPerDay.day_b !== undefined ? (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay.day_b)}`}>
                    PSE {borgPerDay.day_b}
                  </span>
                  <button
                    onClick={() => setShowPSEForDay('day_b')}
                    className="text-white/70 text-xs underline"
                  >
                    Editar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPSEForDay('day_b')}
                  className="mt-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition"
                >
                  Registrar esfuerzo Día B
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
