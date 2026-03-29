import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  ArrowLeft, User, Calendar, Target, ClipboardList,
  Activity, TrendingUp, Edit2, Lock, ChevronRight, Plus,
  Save, X, History, AlertCircle
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

// Fields that have human-readable labels for the history log
const FIELD_LABELS = {
  name: 'Nombre',
  weight_kg: 'Peso (kg)',
  height_cm: 'Altura (cm)',
  birth_date: 'Fecha de nacimiento',
  gender: 'Sexo',
  goal: 'Objetivo',
  weekly_frequency: 'Frecuencia semanal',
  level: 'Nivel',
  observations: 'Observaciones',
  coach_notes: 'Notas privadas',
  target_weight_kg: 'Peso objetivo',
  dni: 'DNI',
}

const LEVEL_LABELS = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }
const GENDER_LABELS = { male: 'Masculino', female: 'Femenino', other: 'Otro' }

function displayValue(field, value) {
  if (!value && value !== 0) return '—'
  if (field === 'gender') return GENDER_LABELS[value] || value
  if (field === 'level') return LEVEL_LABELS[value] || value
  return String(value)
}

export default function StudentDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [logs, setLogs] = useState([])
  const [progressData, setProgressData] = useState([])
  const [editHistory, setEditHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [allPlans, setAllPlans] = useState([])
  const [assigningPlan, setAssigningPlan] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => { fetchStudentData() }, [id])

  async function fetchStudentData() {
    try {
      const [studentRes, assignmentsRes, logsRes, plansRes, historyRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('plan_assignments')
          .select('*, plan:plans!plan_id(*)')
          .eq('student_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('workout_logs')
          .select(`
            *,
            plan_exercise:plan_exercises!plan_exercise_id(
              block_label, section,
              exercise:exercises!exercise_id(name, muscle_group)
            )
          `)
          .eq('student_id', id)
          .order('logged_date', { ascending: false })
          .limit(50),
        supabase.from('plans').select('id, title, plan_type').order('title'),
        supabase.from('student_edit_history')
          .select('*')
          .eq('student_id', id)
          .order('changed_at', { ascending: false })
          .limit(100),
      ])

      const studentData = studentRes.data
      setStudent(studentData)
      setEditData(studentData || {})
      setAssignments(assignmentsRes.data || [])
      setLogs(logsRes.data || [])
      setAllPlans(plansRes.data || [])
      setEditHistory(historyRes.data || [])

      const exerciseData = {}
      ;(logsRes.data || []).forEach(log => {
        if (log.actual_weight && log.plan_exercise?.exercise?.name) {
          const name = log.plan_exercise.exercise.name
          if (!exerciseData[name]) exerciseData[name] = []
          exerciseData[name].push({
            date: log.logged_date,
            weight: log.actual_weight,
            pse: log.perceived_difficulty,
          })
        }
      })
      setProgressData(exerciseData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError(null)
    try {
      // Detect changed fields
      const changedFields = Object.keys(FIELD_LABELS).filter(
        key => editData[key] !== student[key]
      )

      // Update profile
      const updatePayload = {}
      changedFields.forEach(f => { updatePayload[f] = editData[f] || null })

      if (changedFields.length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', id)
        if (updateError) throw updateError

        // Insert history records
        const historyInserts = changedFields.map(f => ({
          student_id: id,
          changed_by: profile.id,
          field_name: f,
          old_value: displayValue(f, student[f]),
          new_value: displayValue(f, editData[f]),
        }))
        await supabase.from('student_edit_history').insert(historyInserts)
      }

      setEditMode(false)
      fetchStudentData()
    } catch (err) {
      setSaveError(err.message || 'Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditData(student || {})
    setEditMode(false)
    setSaveError(null)
  }

  async function assignPlan() {
    if (!selectedPlan) return
    try {
      const { error } = await supabase.from('plan_assignments').insert({
        plan_id: selectedPlan,
        student_id: id,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
      })
      if (error) throw error
      setAssigningPlan(false)
      setSelectedPlan('')
      fetchStudentData()
    } catch (err) {
      console.error(err)
    }
  }

  async function toggleAssignment(assignmentId, currentActive) {
    await supabase.from('plan_assignments').update({ active: !currentActive }).eq('id', assignmentId)
    fetchStudentData()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!student) return (
    <div className="text-center py-12">
      <p className="text-gray-500">Alumno no encontrado</p>
    </div>
  )

  const initials = student.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const topExercises = Object.entries(progressData).slice(0, 3)

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{student.name}</h1>
      </div>

      {/* Profile card */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xl">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-lg">{student.name}</h2>
            <p className="text-sm text-gray-500">{student.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {student.level && (
                <span className="badge bg-primary-100 text-primary-700 capitalize">
                  {LEVEL_LABELS[student.level] || student.level}
                </span>
              )}
              {student.goal && (
                <span className="badge bg-gray-100 text-gray-600 truncate max-w-40">{student.goal}</span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{student.weight_kg || '—'}</p>
            <p className="text-xs text-gray-500">Peso (kg)</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{student.weekly_frequency || '—'}</p>
            <p className="text-xs text-gray-500">Días/semana</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{logs.length}</p>
            <p className="text-xs text-gray-500">Registros</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'info', label: 'Info' },
          { id: 'plans', label: 'Planes' },
          { id: 'progress', label: 'Progreso' },
          { id: 'logs', label: 'Logs' },
          { id: 'history', label: 'Historial' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setEditMode(false) }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.id === 'history' && editHistory.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({editHistory.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== INFO TAB ===== */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          {/* Edit controls */}
          {!editMode ? (
            <div className="flex justify-end">
              <button
                onClick={() => { setEditData({ ...student }); setEditMode(true) }}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <Edit2 size={14} />
                Editar datos
              </button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              <button onClick={cancelEdit} className="btn-ghost flex items-center gap-1.5 text-sm text-gray-600">
                <X size={14} />
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Save size={14} /> Guardar</>
                }
              </button>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
              <AlertCircle size={15} />
              <span>{saveError}</span>
            </div>
          )}

          {/* Personal data */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-900">Datos personales</h3>
            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label text-xs">Nombre</label>
                  <input className="input text-sm" value={editData.name || ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Fecha de nacimiento</label>
                  <input type="date" className="input text-sm" value={editData.birth_date || ''} onChange={e => setEditData(p => ({ ...p, birth_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Sexo</label>
                  <select className="input text-sm" value={editData.gender || ''} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}>
                    <option value="">Sin especificar</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Altura (cm)</label>
                  <input type="number" className="input text-sm" value={editData.height_cm || ''} onChange={e => setEditData(p => ({ ...p, height_cm: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Peso (kg)</label>
                  <input type="number" step="0.1" className="input text-sm" value={editData.weight_kg || ''} onChange={e => setEditData(p => ({ ...p, weight_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Peso objetivo (kg)</label>
                  <input type="number" step="0.1" className="input text-sm" value={editData.target_weight_kg || ''} onChange={e => setEditData(p => ({ ...p, target_weight_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">DNI</label>
                  <input className="input text-sm" value={editData.dni || ''} onChange={e => setEditData(p => ({ ...p, dni: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Nivel</label>
                  <select className="input text-sm" value={editData.level || ''} onChange={e => setEditData(p => ({ ...p, level: e.target.value }))}>
                    <option value="">Sin especificar</option>
                    <option value="beginner">Principiante</option>
                    <option value="intermediate">Intermedio</option>
                    <option value="advanced">Avanzado</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Objetivo</label>
                  <input className="input text-sm" value={editData.goal || ''} onChange={e => setEditData(p => ({ ...p, goal: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Frecuencia semanal</label>
                  <input type="number" min="1" max="7" className="input text-sm" value={editData.weekly_frequency || ''} onChange={e => setEditData(p => ({ ...p, weekly_frequency: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Altura', value: student.height_cm ? `${student.height_cm} cm` : '—' },
                  { label: 'Peso inicial', value: student.weight_kg ? `${student.weight_kg} kg` : '—' },
                  { label: 'Peso objetivo', value: student.target_weight_kg ? `${student.target_weight_kg} kg` : '—' },
                  { label: 'DNI', value: student.dni || '—' },
                  { label: 'Nacimiento', value: student.birth_date ? format(parseISO(student.birth_date), 'dd/MM/yyyy') : '—' },
                  { label: 'Sexo', value: GENDER_LABELS[student.gender] || '—' },
                  { label: 'Frecuencia', value: student.weekly_frequency ? `${student.weekly_frequency} días/sem` : '—' },
                  { label: 'Objetivo', value: student.goal || '—' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-sm font-medium text-gray-900">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observations */}
          <div className="card border-l-4 border-l-blue-400 space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Observaciones (visible para el alumno)</h3>
            {editMode ? (
              <textarea
                className="input resize-none text-sm"
                rows={3}
                value={editData.observations || ''}
                onChange={e => setEditData(p => ({ ...p, observations: e.target.value }))}
                placeholder="Observaciones visibles para el alumno..."
              />
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {student.observations || <span className="text-gray-400 italic">Sin observaciones</span>}
              </p>
            )}
          </div>

          {/* Coach notes */}
          <div className="card border-l-4 border-l-primary-400 space-y-2">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-primary-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Notas privadas del coach</h3>
            </div>
            {editMode ? (
              <textarea
                className="input resize-none text-sm"
                rows={3}
                value={editData.coach_notes || ''}
                onChange={e => setEditData(p => ({ ...p, coach_notes: e.target.value }))}
                placeholder="Notas privadas (el alumno no las ve)..."
              />
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {student.coach_notes || <span className="text-gray-400 italic">Sin notas</span>}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== PLANS TAB ===== */}
      {activeTab === 'plans' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Planes asignados</h3>
            <button
              onClick={() => setAssigningPlan(true)}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
            >
              <Plus size={14} />
              Asignar plan
            </button>
          </div>

          {assigningPlan && (
            <div className="card border-2 border-primary-200 space-y-3">
              <h4 className="font-medium text-gray-900">Asignar nuevo plan</h4>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className="input">
                <option value="">Seleccioná un plan...</option>
                {allPlans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.plan_type === 'evaluation' ? '📊 ' : ''}{p.title}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setAssigningPlan(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={assignPlan} disabled={!selectedPlan} className="btn-primary flex-1 text-sm">Asignar</button>
              </div>
            </div>
          )}

          {assignments.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin planes asignados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map(a => (
                <div key={a.id} className="card flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${a.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {a.plan?.plan_type === 'evaluation' ? '📊 ' : ''}{a.plan?.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.active ? 'Activo' : 'Inactivo'}
                      {a.start_date ? ` · Desde ${format(parseISO(a.start_date), 'dd/MM/yy')}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleAssignment(a.id, a.active)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      a.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                    }`}
                  >
                    {a.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== PROGRESS TAB ===== */}
      {activeTab === 'progress' && (
        <div className="space-y-4">
          {topExercises.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin datos de progreso aún</p>
            </div>
          ) : (
            topExercises.map(([exerciseName, data]) => {
              const sortedData = [...data].sort((a, b) => a.date > b.date ? 1 : -1)
              return (
                <div key={exerciseName} className="card">
                  <h4 className="font-semibold text-gray-900 text-sm mb-3 truncate">{exerciseName}</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={sortedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value) => [`${value} kg`, 'Peso']}
                        labelFormatter={(label) => format(parseISO(label), 'dd/MM/yy')}
                      />
                      <Line type="monotone" dataKey="weight" stroke="#ea580c" strokeWidth={2} dot={{ fill: '#ea580c', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ===== LOGS TAB ===== */}
      {activeTab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin registros aún</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {log.plan_exercise?.exercise?.name || 'Ejercicio'}
                      </p>
                      {log.logged_late && (
                        <span className="badge bg-orange-100 text-orange-600 text-xs">Registrado tarde</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        log.actual_sets && `${log.actual_sets} series`,
                        log.actual_reps && `${log.actual_reps} reps`,
                        log.actual_weight && `${log.actual_weight}kg`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate">"{log.notes}"</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">{format(parseISO(log.logged_date), 'dd/MM/yy')}</p>
                    {log.perceived_difficulty && (
                      <span className={`badge mt-1 ${
                        log.perceived_difficulty >= 8 ? 'bg-red-100 text-red-700' :
                        log.perceived_difficulty >= 5 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        PSE {log.perceived_difficulty}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-gray-500" />
            <h3 className="font-semibold text-gray-900">Historial de modificaciones</h3>
          </div>

          {editHistory.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin modificaciones registradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {editHistory.map(h => (
                <div key={h.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Edit2 size={13} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {FIELD_LABELS[h.field_name] || h.field_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs">
                        <span className="text-red-500 line-through">{h.old_value || '—'}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600 font-medium">{h.new_value || '—'}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">
                      {format(parseISO(h.changed_at), "d/MM/yy HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
