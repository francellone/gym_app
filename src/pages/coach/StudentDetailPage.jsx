import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  ArrowLeft, User, Calendar, Target, ClipboardList,
  Activity, TrendingUp, Edit2, Lock, ChevronRight, Plus,
  Save, X, History, AlertCircle, Send, FileCheck
} from 'lucide-react'
import { buildFormConfig } from '../../../intake-form/schema/default-form.js'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, AreaChart, Area,
  ComposedChart,
} from 'recharts'
import { borgColor, BORG_LABELS } from '../../utils/planHelpers'
import { startOfWeek, endOfWeek, eachDayOfInterval, subDays } from 'date-fns'

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

  // Progress tab
  const [sessions, setSessions] = useState([])
  const [progressPeriod, setProgressPeriod] = useState(90)
  const [progressLogs, setProgressLogs] = useState([])
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressExercises, setProgressExercises] = useState([])
  const [selectedExercise, setSelectedExercise] = useState('')
  const [activeChart, setActiveChart] = useState('weight')

  // Intake form
  const [formAssignment, setFormAssignment] = useState(null)
  const [formSubmission, setFormSubmission] = useState(null)
  const [sendingForm, setSendingForm] = useState(false)
  const [formSentOk, setFormSentOk] = useState(false)

  useEffect(() => { fetchStudentData() }, [id])

  useEffect(() => {
    if (activeTab === 'progress' && id) fetchProgressData()
  }, [activeTab, progressPeriod, id])

  async function fetchProgressData() {
    setProgressLoading(true)
    const since = format(subDays(new Date(), progressPeriod), 'yyyy-MM-dd')
    const [logsRes, sessionsRes] = await Promise.all([
      supabase
        .from('workout_logs')
        .select(`*, plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section, suggested_sets, suggested_weight,
          exercise:exercises!exercise_id(id, name)
        )`)
        .eq('student_id', id)
        .gte('logged_date', since)
        .order('logged_date'),
      supabase
        .from('v_workout_session_intensity')
        .select('*')
        .eq('student_id', id)
        .gte('logged_date', since)
        .order('logged_date'),
    ])
    const logData = logsRes.data || []
    setProgressLogs(logData)
    setSessions(sessionsRes.data || [])
    const exMap = {}
    logData.forEach(l => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = ex.name
    })
    const exList = Object.entries(exMap).map(([id, name]) => ({ id, name }))
    setProgressExercises(exList)
    if (exList.length > 0 && !selectedExercise) setSelectedExercise(exList[0].id)
    setProgressLoading(false)
  }

  async function fetchStudentData() {
    try {
      const [studentRes, assignmentsRes, logsRes, plansRes, historyRes, formAssignmentRes, formSubmissionRes] = await Promise.all([
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
        // Intake form: asignación más reciente para este alumno
        supabase.from('intake_form_assignments')
          .select('*')
          .eq('student_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Intake form: respuesta enviada (si existe)
        supabase.from('intake_form_submissions')
          .select('*')
          .eq('student_id', id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const studentData = studentRes.data
      setStudent(studentData)
      setEditData(studentData || {})
      setAssignments(assignmentsRes.data || [])
      setLogs(logsRes.data || [])
      setAllPlans(plansRes.data || [])
      setEditHistory(historyRes.data || [])
      setFormAssignment(formAssignmentRes.data || null)
      setFormSubmission(formSubmissionRes.data || null)

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

  // ── Enviar formulario de ingreso al alumno ────────────────
  async function sendForm() {
    setSendingForm(true)
    try {
      // Cargar la plantilla default del coach (si existe)
      const { data: template } = await supabase
        .from('intake_form_templates')
        .select('*')
        .eq('coach_id', profile.id)
        .eq('is_default', true)
        .maybeSingle()

      const formSnapshot = template?.config || buildFormConfig()

      const { error } = await supabase
        .from('intake_form_assignments')
        .insert({
          template_id: template?.id || null,
          coach_id: profile.id,
          student_id: id,
          form_snapshot: formSnapshot,
          status: 'pending',
        })

      if (error) throw error
      setFormSentOk(true)
      setTimeout(() => setFormSentOk(false), 3000)
      fetchStudentData()
    } catch (err) {
      console.error('Error al enviar formulario:', err)
    } finally {
      setSendingForm(false)
    }
  }

  // ── Helper para mostrar respuestas del formulario ─────────
  function formatIntakeResponse(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'boolean') return value ? 'Sí' : 'No'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
    return String(value)
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

  // Para mostrar formulario de ingreso en Info tab
  const formModules = formSubmission?.form_snapshot?.modules
    ?.filter(m => m.enabled)
    ?.sort((a, b) => a.order - b.order) || []

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

      {/* Toast – formulario enviado */}
      {formSentOk && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          ✅ Formulario enviado al alumno
        </div>
      )}

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

          {/* ── Formulario de ingreso ── */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-primary-500" />
                <h3 className="font-semibold text-gray-900 text-sm">Formulario de ingreso</h3>
              </div>
              {formSubmission && (
                <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
                  <FileCheck size={11} /> Completado
                </span>
              )}
              {formAssignment && !formSubmission && (
                <span className="badge bg-yellow-100 text-yellow-700 text-xs">Pendiente</span>
              )}
            </div>

            {/* Sin asignación: botón para enviar */}
            {!formAssignment && (
              <div className="text-center py-3 space-y-3">
                <p className="text-sm text-gray-500">
                  El alumno todavía no recibió el formulario de ingreso.
                </p>
                <button
                  onClick={sendForm}
                  disabled={sendingForm}
                  className="btn-primary flex items-center gap-2 text-sm mx-auto"
                >
                  {sendingForm
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={14} />
                  }
                  Enviar formulario
                </button>
              </div>
            )}

            {/* Asignado pero sin respuesta aún */}
            {formAssignment && !formSubmission && (
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  El formulario fue enviado y está esperando respuesta del alumno.
                </p>
                <p className="text-xs text-gray-400">
                  Enviado el {format(parseISO(formAssignment.sent_at), "d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>
            )}

            {/* Respuestas enviadas – vista read-only */}
            {formSubmission && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  Completado el {format(parseISO(formSubmission.submitted_at), "d 'de' MMMM yyyy", { locale: es })}
                </p>

                {formModules.map(module => {
                  const answered = (module.questions || []).filter(q => {
                    const val = formSubmission.responses?.[q.id]
                    // Excluir consentimientos (boolean required sin info útil)
                    if (q.id?.startsWith('consentimiento')) return false
                    return val !== undefined && val !== null && val !== '' &&
                      !(Array.isArray(val) && val.length === 0)
                  })
                  if (!answered.length) return null
                  return (
                    <div key={module.id} className="space-y-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {module.emoji} {module.title}
                      </p>
                      <div className="space-y-2">
                        {answered.map(q => (
                          <div key={q.id} className="flex gap-3 text-xs leading-relaxed">
                            <span className="text-gray-500 w-2/5 flex-shrink-0">{q.label}</span>
                            <span className="text-gray-900 font-medium flex-1 text-right">
                              {formatIntakeResponse(formSubmission.responses[q.id])}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
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
      {activeTab === 'progress' && (() => {
        // ── Computed chart data ────────────────────────────────
        const weightData = progressLogs
          .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && (l.actual_weights || l.actual_weight))
          .map(l => {
            let pesoMax = l.actual_weight || 0
            if (l.actual_weights) {
              try {
                const arr = JSON.parse(l.actual_weights)
                pesoMax = Array.isArray(arr) && arr.length > 0
                  ? Math.max(...arr.map(w => parseFloat(w || 0)))
                  : parseFloat(l.actual_weights) || pesoMax
              } catch { pesoMax = parseFloat(l.actual_weights) || pesoMax }
            }
            return { date: format(parseISO(l.logged_date), 'dd/MM'), Peso: pesoMax, PSE: l.perceived_difficulty }
          }).filter(d => d.Peso > 0)

        const volumeByDate = {}
        progressLogs.forEach(l => {
          if (l.actual_sets && (l.actual_weights || l.actual_weight)) {
            const reps = parseFloat(l.actual_reps) || 10
            let weight = 0
            if (l.actual_weights) {
              try {
                const arr = JSON.parse(l.actual_weights)
                weight = Array.isArray(arr) && arr.length > 0
                  ? arr.reduce((a, b) => a + parseFloat(b || 0), 0) / arr.length
                  : parseFloat(l.actual_weights) || 0
              } catch { weight = parseFloat(l.actual_weights) || 0 }
            } else { weight = l.actual_weight || 0 }
            if (weight > 0) {
              const date = format(parseISO(l.logged_date), 'dd/MM')
              volumeByDate[date] = (volumeByDate[date] || 0) + Math.round(l.actual_sets * reps * weight)
            }
          }
        })
        const volumeData = Object.entries(volumeByDate).map(([date, Volumen]) => ({ date, Volumen }))

        const pseByDate = {}
        progressLogs.forEach(l => {
          if (l.perceived_difficulty) {
            const date = format(parseISO(l.logged_date), 'dd/MM')
            if (!pseByDate[date]) pseByDate[date] = []
            pseByDate[date].push(l.perceived_difficulty)
          }
        })
        const pseData = Object.entries(pseByDate).map(([date, vals]) => ({
          date, 'PSE promedio': Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10
        }))

        const borgData = sessions
          .filter(s => s.borg_value != null)
          .map(s => ({
            date: format(parseISO(s.logged_date), 'dd/MM'),
            Intensidad: Number(s.borg_value),
            label: BORG_LABELS?.[Math.round(Number(s.borg_value))] || '',
          }))

        const durationData = sessions
          .filter(s => s.started_at && s.finished_at)
          .map(s => ({
            date: format(parseISO(s.logged_date), 'dd/MM'),
            Minutos: Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000),
          }))

        const compareData = progressLogs
          .filter(l => l.plan_exercise?.exercise?.id === selectedExercise)
          .map(l => ({
            date: format(parseISO(l.logged_date), 'dd/MM'),
            'Series reales': l.actual_sets || 0,
            'Series sugeridas': l.plan_exercise?.suggested_sets || 0,
            'Peso real': l.actual_weight || 0,
          }))

        const sessionDates = new Set(progressLogs.map(l => l.logged_date))
        const totalSessions = sessionDates.size
        const totalCompleted = progressLogs.filter(l => l.completed).length
        const withPSE = progressLogs.filter(l => l.perceived_difficulty)
        const avgPSE = withPSE.length > 0
          ? Math.round(withPSE.reduce((a, l) => a + l.perceived_difficulty, 0) / withPSE.length * 10) / 10
          : null
        const avgBorg = borgData.length > 0
          ? Math.round(borgData.reduce((a, d) => a + d.Intensidad, 0) / borgData.length * 10) / 10
          : null
        const maxWeight = progressLogs
          .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && l.actual_weight)
          .reduce((mx, l) => Math.max(mx, l.actual_weight), 0)

        // Heatmap asistencia (últimas 8 semanas)
        const today = new Date()
        const weeks = Array.from({ length: 8 }, (_, wi) => {
          const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
          return eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })
        }).reverse()
        const logDates = new Set(progressLogs.map(l => l.logged_date))

        const CHARTS = [
          { id: 'weight', label: 'Peso' },
          { id: 'volume', label: 'Volumen' },
          { id: 'pse', label: 'PSE' },
          { id: 'borg', label: 'Intensidad' },
          { id: 'duration', label: 'Duración' },
          { id: 'compare', label: 'Plan vs Real' },
        ]
        const PERIODS = [
          { label: '1m', days: 30 },
          { label: '3m', days: 90 },
          { label: '6m', days: 180 },
          { label: 'Todo', days: 365 },
        ]

        const TooltipCard = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null
          return (
            <div className="bg-white shadow-lg rounded-xl p-2.5 border border-gray-100 text-xs">
              <p className="font-semibold text-gray-700 mb-1">{label}</p>
              {payload.map((e, i) => (
                <p key={i} style={{ color: e.color }}>{e.name}: {e.value}{e.unit || ''}</p>
              ))}
            </div>
          )
        }

        return (
          <div className="space-y-4">
            {/* Selector de período */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {PERIODS.map(p => (
                <button key={p.days} onClick={() => setProgressPeriod(p.days)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${progressPeriod === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {p.label}
                </button>
              ))}
            </div>

            {progressLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : progressLogs.length === 0 ? (
              <div className="card text-center py-8 text-gray-400">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin datos de progreso en este período</p>
              </div>
            ) : (
              <>
                {/* Stats resumen */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: totalSessions, label: 'Sesiones' },
                    { val: totalCompleted, label: 'Completados' },
                    { val: avgPSE ?? '—', label: 'PSE prom.' },
                  ].map(s => (
                    <div key={s.label} className="card text-center py-2">
                      <p className="text-2xl font-bold text-gray-900">{s.val}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>

                {avgBorg !== null && (
                  <div className="card flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Intensidad promedio</p>
                      <p className="text-xs text-gray-500">Escala de Borg (0–10)</p>
                    </div>
                    <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${borgColor(Math.round(avgBorg))}`}>
                      {avgBorg}
                    </span>
                  </div>
                )}

                {maxWeight > 0 && (
                  <div className="card flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Peso máximo registrado</p>
                      <p className="text-xs text-gray-500">{progressExercises.find(e => e.id === selectedExercise)?.name}</p>
                    </div>
                    <span className="text-2xl font-bold text-primary-600">{maxWeight}kg</span>
                  </div>
                )}

                {/* Heatmap asistencia */}
                <div className="card space-y-3">
                  <p className="text-sm font-semibold text-gray-900">Asistencia (últimas 8 semanas)</p>
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {['L','M','X','J','V','S','D'].map(d => (
                        <div key={d} className="flex-1 text-center text-xs text-gray-400">{d}</div>
                      ))}
                    </div>
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex gap-1">
                        {week.map((day, di) => {
                          const ds = format(day, 'yyyy-MM-dd')
                          return (
                            <div key={di} title={ds}
                              className={`flex-1 h-5 rounded ${day > today ? 'bg-gray-50' : logDates.has(ds) ? 'bg-primary-500' : 'bg-gray-100'}`}
                            />
                          )
                        })}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-xs text-gray-400 justify-end">
                      <div className="w-3 h-3 rounded bg-gray-100" /> Sin entrenamiento
                      <div className="w-3 h-3 rounded bg-primary-500" /> Con entrenamiento
                    </div>
                  </div>
                </div>

                {/* Selector de ejercicio */}
                {progressExercises.length > 0 && (
                  <select className="input text-sm w-full" value={selectedExercise}
                    onChange={e => setSelectedExercise(e.target.value)}>
                    {progressExercises.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </select>
                )}

                {/* Chart tabs */}
                <div className="overflow-x-auto -mx-5 px-5">
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-max min-w-full">
                    {CHARTS.map(c => (
                      <button key={c.id} onClick={() => setActiveChart(c.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${activeChart === c.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gráfico: Peso */}
                {activeChart === 'weight' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Progresión de peso</p>
                      <p className="text-xs text-gray-500">Peso máximo levantado por sesión</p>
                    </div>
                    {weightData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={weightData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="kg" />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area yAxisId="left" type="monotone" dataKey="Peso" fill="#fde68a" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} unit="kg" />
                          <Line yAxisId="right" type="monotone" dataKey="PSE" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos de peso para este ejercicio</p>
                    )}
                  </div>
                )}

                {/* Gráfico: Volumen */}
                {activeChart === 'volume' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Volumen total por sesión</p>
                      <p className="text-xs text-gray-500">Series × Reps × Peso</p>
                    </div>
                    {volumeData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={volumeData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Bar dataKey="Volumen" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos de volumen</p>
                    )}
                  </div>
                )}

                {/* Gráfico: PSE */}
                {activeChart === 'pse' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">PSE promedio por sesión</p>
                      <p className="text-xs text-gray-500">Esfuerzo percibido (1–10)</p>
                    </div>
                    {pseData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={pseData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Area type="monotone" dataKey="PSE promedio" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos de PSE</p>
                    )}
                  </div>
                )}

                {/* Gráfico: Intensidad Borg */}
                {activeChart === 'borg' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Intensidad general</p>
                      <p className="text-xs text-gray-500">Escala de Borg por sesión</p>
                    </div>
                    {borgData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={borgData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Bar dataKey="Intensidad" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos de Borg registrados</p>
                    )}
                  </div>
                )}

                {/* Gráfico: Duración */}
                {activeChart === 'duration' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Duración de sesiones</p>
                      <p className="text-xs text-gray-500">En minutos</p>
                    </div>
                    {durationData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={durationData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} unit="min" />
                          <Tooltip content={<TooltipCard />} />
                          <Area type="monotone" dataKey="Minutos" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos de duración</p>
                    )}
                  </div>
                )}

                {/* Gráfico: Plan vs Real */}
                {activeChart === 'compare' && (
                  <div className="card space-y-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Plan vs Real</p>
                      <p className="text-xs text-gray-500">Series planificadas vs ejecutadas</p>
                    </div>
                    {compareData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={compareData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Series sugeridas" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Series reales" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-gray-400 py-6">Sin datos para este ejercicio</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

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
