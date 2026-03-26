import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  ExternalLink, Save, Dumbbell, PlayCircle, Info
} from 'lucide-react'

const SECTION_LABELS = {
  activation: '🔥 Activación',
  day_a: '💪 Principal Día A',
  day_b: '🏋️ Principal Día B',
}

const PSE_OPTIONS = [
  { value: 1, label: '1 - Muy fácil' },
  { value: 2, label: '2 - Fácil' },
  { value: 3, label: '3 - Moderado' },
  { value: 4, label: '4 - Algo duro' },
  { value: 5, label: '5 - Duro' },
  { value: 6, label: '6 - Duro +' },
  { value: 7, label: '7 - Muy duro' },
  { value: 8, label: '8 - Muy duro +' },
  { value: 9, label: '9 - Casi máximo' },
  { value: 10, label: '10 - Máximo esfuerzo' },
]

function ExerciseCard({ planEx, log, onSaveLog }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logData, setLogData] = useState({
    actual_sets: log?.actual_sets || planEx.suggested_sets || '',
    actual_reps: log?.actual_reps || planEx.suggested_reps || '',
    actual_weight: log?.actual_weight || '',
    perceived_difficulty: log?.perceived_difficulty || '',
    notes: log?.notes || '',
    completed: log?.completed || false,
  })

  const completed = logData.completed

  async function handleSave() {
    setSaving(true)
    try {
      await onSaveLog(planEx.id, {
        actual_sets: logData.actual_sets ? parseInt(logData.actual_sets) : null,
        actual_reps: logData.actual_reps || null,
        actual_weight: logData.actual_weight ? parseFloat(logData.actual_weight) : null,
        perceived_difficulty: logData.perceived_difficulty ? parseInt(logData.perceived_difficulty) : null,
        perceived_difficulty_label: logData.perceived_difficulty
          ? PSE_OPTIONS.find(p => p.value === parseInt(logData.perceived_difficulty))?.label
          : null,
        notes: logData.notes || null,
        completed: true,
      })
      setLogData(p => ({ ...p, completed: true }))
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden ${
      completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'
    }`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <button
          onClick={e => {
            e.stopPropagation()
            if (!completed) setEditing(true)
          }}
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
          <p className="text-xs text-gray-500 mt-0.5">
            {[
              planEx.suggested_sets && `${planEx.suggested_sets} series`,
              planEx.suggested_reps && `× ${planEx.suggested_reps}`,
              planEx.suggested_weight && planEx.suggested_weight !== 'None' && `· ${planEx.suggested_weight}`,
              planEx.rest_time && `· ${planEx.rest_time}`,
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

          {/* PSE suggested */}
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Series</label>
                  <input
                    type="number"
                    className="input text-sm text-center"
                    placeholder={planEx.suggested_sets || '—'}
                    value={logData.actual_sets}
                    onChange={e => setLogData(p => ({ ...p, actual_sets: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Reps</label>
                  <input
                    className="input text-sm text-center"
                    placeholder={planEx.suggested_reps || '—'}
                    value={logData.actual_reps}
                    onChange={e => setLogData(p => ({ ...p, actual_reps: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input text-sm text-center"
                    placeholder="0"
                    value={logData.actual_weight}
                    onChange={e => setLogData(p => ({ ...p, actual_weight: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Esfuerzo percibido (PSE)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      onClick={() => setLogData(p => ({ ...p, perceived_difficulty: n }))}
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
                onClick={handleSave}
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
              <p className="text-xs text-green-600">
                {[
                  log?.actual_sets && `${log.actual_sets} series`,
                  log?.actual_reps && `× ${log.actual_reps}`,
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
  )
}

export default function TodayWorkoutPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [logs, setLogs] = useState({})
  const [activeDay, setActiveDay] = useState('day_a')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (profile?.id) fetchWorkout()
  }, [profile])

  async function fetchWorkout() {
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

      const [exercisesRes, logsRes] = await Promise.all([
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
          .eq('logged_date', today)
      ])

      setPlanExercises(exercisesRes.data || [])

      // Map logs by plan_exercise_id
      const logsMap = {}
      ;(logsRes.data || []).forEach(log => {
        logsMap[log.plan_exercise_id] = log
      })
      setLogs(logsMap)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
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
          logged_date: today,
        })
        .select()
        .single()
    }

    if (result.error) throw result.error

    setLogs(prev => ({ ...prev, [planExerciseId]: result.data }))
  }

  const sections = {
    activation: planExercises.filter(e => e.section === 'activation'),
    day_a: planExercises.filter(e => e.section === 'day_a'),
    day_b: planExercises.filter(e => e.section === 'day_b'),
  }

  const completedCount = Object.values(logs).filter(l => l.completed).length
  const totalCount = planExercises.length

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
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-6">
        <p className="text-primary-200 text-sm">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        <h1 className="text-xl font-bold text-white mt-1">{assignment.plan?.title}</h1>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-primary-200 text-xs">{completedCount} / {totalCount} ejercicios</span>
            <span className="text-primary-200 text-xs">{Math.round(completedCount / totalCount * 100)}%</span>
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

        {/* Activation */}
        {sections.activation.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
              {SECTION_LABELS.activation}
            </h2>
            <div className="space-y-2">
              {sections.activation.map(ex => (
                <ExerciseCard
                  key={ex.id}
                  planEx={ex}
                  log={logs[ex.id]}
                  onSaveLog={saveLog}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main day */}
        {sections[activeDay]?.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
              {SECTION_LABELS[activeDay]}
            </h2>
            <div className="space-y-2">
              {sections[activeDay].map(ex => (
                <ExerciseCard
                  key={ex.id}
                  planEx={ex}
                  log={logs[ex.id]}
                  onSaveLog={saveLog}
                />
              ))}
            </div>
          </div>
        )}

        {completedCount === totalCount && totalCount > 0 && (
          <div className="card bg-gradient-to-r from-green-500 to-emerald-500 text-center py-6">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-white font-bold text-lg">¡Entrenamiento completo!</p>
            <p className="text-green-100 text-sm mt-1">Excelente trabajo hoy</p>
          </div>
        )}
      </div>
    </div>
  )
}
