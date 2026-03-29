import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  ExternalLink, Dumbbell, PlayCircle, Info,
  Calendar, AlertTriangle, Clock
} from 'lucide-react'
import { BORG_LABELS, borgColor, parseReps, serializeReps, SECTION_LABELS, displayReps } from '../../utils/planHelpers'

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

// ============================================================
// Modal de aviso de validación
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
// Modal Escala de Borg al finalizar
// ============================================================
function BorgModal({ session, onSave, onClose }) {
  const [borg, setBorg] = useState(session?.borg_scale ?? null)
  const [borgNotes, setBorgNotes] = useState(session?.borg_notes || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (borg === null) return
    setSaving(true)
    await onSave(borg, borgNotes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="text-3xl mb-1">🎉</p>
            <h2 className="font-bold text-gray-900 text-lg">¡Entrenamiento completo!</h2>
            <p className="text-sm text-gray-500 mt-1">
              ¿Qué tan intenso fue el entrenamiento de hoy?
            </p>
          </div>

          {/* Escala de Borg 0-10 */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 text-center">Escala de Borg (0-10)</p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(BORG_LABELS).map(([val, label]) => {
                const n = parseInt(val)
                return (
                  <button
                    key={n}
                    onClick={() => setBorg(n)}
                    className={`rounded-xl p-2 text-center transition-all ${
                      borg === n
                        ? borgColor(n) + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className="block text-lg font-bold">{n}</span>
                    <span className="block text-xs leading-tight mt-0.5">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Observaciones del entrenamiento (opcional)</label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder="¿Cómo te sentiste hoy?"
              value={borgNotes}
              onChange={e => setBorgNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">
              Omitir
            </button>
            <button
              onClick={handleSave}
              disabled={borg === null || saving}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Guardar y finalizar'
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
function ExerciseCard({ planEx, log, onSaveLog, suggestedSets }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState(null)
  const [pendingData, setPendingData] = useState(null)

  // Parsear reps sugeridas (puede ser array o string)
  const suggestedRepsRaw = planEx.suggested_reps
  const suggestedRepsArr = parseReps(suggestedRepsRaw)
  const setsCount = parseInt(suggestedSets || planEx.suggested_sets) || 0

  // Inicializar log data con valores actuales o sugeridos
  const initRepsArr = () => {
    if (log?.actual_reps) {
      const parsed = parseReps(log.actual_reps)
      // Ajustar longitud si es necesario
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
    actual_sets: log?.actual_sets?.toString() || suggestedSets?.toString() || '',
    actual_reps_arr: initRepsArr(),
    actual_weight: log?.actual_weight?.toString() || '',
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
    const n = parseInt(val) || 0
    const currentReps = logData.actual_reps_arr
    let newReps
    if (n === 0) {
      newReps = ['']
    } else if (n > currentReps.length) {
      newReps = [...currentReps, ...Array(n - currentReps.length).fill('')]
    } else {
      newReps = currentReps.slice(0, n)
    }
    setLogData(p => ({ ...p, actual_sets: val, actual_reps_arr: newReps }))
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
    // Validar peso: máx razonable
    if (data.actual_weight && data.actual_weight > 500) {
      return `Peso registrado (${data.actual_weight}kg) parece muy alto. ¿Es correcto?`
    }
    // Validar series: ±50% del sugerido
    if (suggestedSets && data.actual_sets) {
      const suggested = parseInt(suggestedSets)
      const actual = data.actual_sets
      if (actual < suggested * 0.5 || actual > suggested * 1.5) {
        return `Registraste ${actual} series (el plan sugiere ${suggested}). ¿Es correcto?`
      }
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
            {/* Sugerido */}
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
            {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
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

                {/* Series input */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Series realizadas</label>
                    <div className="flex items-center gap-2">
                      {planEx.suggested_sets && (
                        <span className="text-xs text-gray-400">Sug: {planEx.suggested_sets}</span>
                      )}
                      <input
                        type="number"
                        min="0"
                        max="30"
                        className="input text-sm text-center flex-1"
                        placeholder={planEx.suggested_sets || '—'}
                        value={logData.actual_sets}
                        onChange={e => handleSetsChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Peso (kg)</label>
                    <div className="flex items-center gap-2">
                      {planEx.suggested_weight && planEx.suggested_weight !== 'None' && (
                        <span className="text-xs text-gray-400 truncate max-w-16">Sug: {planEx.suggested_weight}</span>
                      )}
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="input text-sm text-center flex-1"
                        placeholder="0"
                        value={logData.actual_weight}
                        onChange={e => setLogData(p => ({ ...p, actual_weight: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Reps por serie */}
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

                {/* PSE */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Esfuerzo percibido (PSE)</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        onClick={() => setLogData(p => ({ ...p, perceived_difficulty: p.perceived_difficulty === n ? null : n }))}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                          logData.perceived_difficulty === n
                            ? n >= 8 ? 'bg-red-500 text-white' : n >= 5 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
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
                <button onClick={() => setEditing(true)} className="text-xs text-green-700 underline">
                  Editar
                </button>
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
  const [showBorg, setShowBorg] = useState(false)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const sessionStartRef = useRef(null)

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (profile?.id) fetchWorkout()
  }, [profile, selectedDate])

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
        })
        .select()
        .single()
    }

    if (result.error) throw result.error
    setLogs(prev => ({ ...prev, [planExerciseId]: result.data }))
  }

  async function saveBorg(borgScale, borgNotes) {
    const finishedAt = new Date().toISOString()
    await upsertSession({
      borg_scale: borgScale,
      borg_notes: borgNotes || null,
      finished_at: finishedAt,
    })
    setShowBorg(false)
  }

  const sections = {
    activation: planExercises.filter(e => e.section === 'activation'),
    day_a: planExercises.filter(e => e.section === 'day_a'),
    day_b: planExercises.filter(e => e.section === 'day_b'),
  }

  const completedCount = Object.values(logs).filter(l => l.completed).length
  const totalCount = planExercises.length
  const allCompleted = completedCount === totalCount && totalCount > 0

  // Cuando se completan todos, si no se registró Borg, mostrar modal
  useEffect(() => {
    if (allCompleted && !session?.borg_scale && !showBorg) {
      setShowBorg(true)
    }
  }, [allCompleted])

  // Últimos 7 días para el selector de fecha
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), i)
    return {
      value: format(d, 'yyyy-MM-dd'),
      label: i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : format(d, "EEE d/MM", { locale: es }),
    }
  })

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
      {showBorg && (
        <BorgModal
          session={session}
          onSave={saveBorg}
          onClose={() => setShowBorg(false)}
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

          {/* Borg registrado */}
          {session?.borg_scale !== null && session?.borg_scale !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-primary-200 text-xs">Intensidad general:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${borgColor(session.borg_scale)}`}>
                {session.borg_scale} - {BORG_LABELS[session.borg_scale]}
              </span>
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
          {/* Selector de fecha (últimos 7 días) */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400 flex-shrink-0" />
            <select
              className="input text-sm flex-1"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            >
              {dateOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!isToday && (
              <span className="badge bg-orange-100 text-orange-700 text-xs">Editando pasado</span>
            )}
          </div>

          {/* Day selector */}
          {(sections.day_a.length > 0 || sections.day_b.length > 0) && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[
                { id: 'day_a', label: 'Día A' },
                { id: 'day_b', label: 'Día B' },
              ].filter(d => sections[d.id].length > 0).map(d => (
                <button
                  key={d.id}
                  onClick={() => setActiveDay(d.id)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeDay === d.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {d.label}
                </button>
              ))}
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
                    suggestedSets={ex.suggested_sets}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Día principal */}
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
                    suggestedSets={ex.suggested_sets}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completado - botón para Borg si no se registró */}
          {allCompleted && !showBorg && (
            <div className="card bg-gradient-to-r from-green-500 to-emerald-500 text-center py-6">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-white font-bold text-lg">¡Entrenamiento completo!</p>
              {!session?.borg_scale && (
                <button
                  onClick={() => setShowBorg(true)}
                  className="mt-3 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
                >
                  Registrar intensidad general
                </button>
              )}
              {session?.borg_scale !== null && session?.borg_scale !== undefined && (
                <p className="text-green-100 text-sm mt-1">
                  Intensidad: {session.borg_scale}/10 — {BORG_LABELS[session.borg_scale]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
