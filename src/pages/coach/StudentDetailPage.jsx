import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft } from 'lucide-react'
import { LEVEL_LABELS } from '../../utils/studentHelpers'
import { getPaymentStatus, getPlanStatus, PAYMENT_STATUS, PLAN_STATUS } from '../../utils/studentStatus'

// ── Tabs ────────────────────────────────────────────────────
import StudentInfoTab from './student/StudentInfoTab'
import StudentPlansTab from './student/StudentPlansTab'
import StudentProgressTab from './student/StudentProgressTab'
import StudentLogsTab from './student/StudentLogsTab'
import StudentHistoryTab from './student/StudentHistoryTab'

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'plans', label: 'Planes' },
  { id: 'progress', label: 'Progreso' },
  { id: 'logs', label: 'Logs' },
  { id: 'history', label: 'Historial' },
]

// ─────────────────────────────────────────────────────────────
// StudentDetailPage — orquestador
//
// Responsabilidades:
//   - Carga de datos del alumno (perfil + datos relacionados)
//   - Distribución de datos a cada tab como props
//   - Renderizado del header y nav de tabs
// ─────────────────────────────────────────────────────────────
export default function StudentDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [student, setStudent] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [logs, setLogs] = useState([])
  const [allPlans, setAllPlans] = useState([])
  const [editHistory, setEditHistory] = useState([])
  const [formAssignment, setFormAssignment] = useState(null)
  const [formSubmission, setFormSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')

  useEffect(() => { fetchStudentData() }, [id])

  async function fetchStudentData() {
    try {
      const [
        studentRes, assignmentsRes, logsRes, plansRes,
        historyRes, formAssignmentRes, formSubmissionRes,
      ] = await Promise.all([
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
        supabase.from('intake_form_assignments')
          .select('*')
          .eq('student_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('intake_form_submissions')
          .select('*')
          .eq('student_id', id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      setStudent(studentRes.data)
      setAssignments(assignmentsRes.data || [])
      setLogs(logsRes.data || [])
      setAllPlans(plansRes.data || [])
      setEditHistory(historyRes.data || [])
      setFormAssignment(formAssignmentRes.data || null)
      setFormSubmission(formSubmissionRes.data || null)
    } catch (err) {
      console.error('[StudentDetailPage]', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Alumno no encontrado</p>
      </div>
    )
  }

  // ── Datos derivados para el header ──────────────────────
  const initials = student.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const paymentStatus = getPaymentStatus(student)
  const planStatus = getPlanStatus(assignments)
  const paymentConfig = PAYMENT_STATUS[paymentStatus]
  const planConfig = PLAN_STATUS[planStatus]

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{student.name}</h1>
      </div>

      {/* Tarjeta de perfil */}
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

        {/* Stats rápidos */}
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

        {/* Badges de estado de gestión */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className={`badge text-xs flex items-center gap-1 ${planConfig.badgeClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${planConfig.dotClass}`} />
            {planConfig.label}
          </span>
          <span className={`badge text-xs flex items-center gap-1 ${paymentConfig.badgeClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${paymentConfig.dotClass}`} />
            {paymentConfig.label}
          </span>
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

      {/* ── Contenido de cada tab ── */}
      {activeTab === 'info' && (
        <StudentInfoTab
          student={student}
          studentId={id}
          coachId={profile.id}
          formAssignment={formAssignment}
          formSubmission={formSubmission}
          onRefresh={fetchStudentData}
        />
      )}

      {activeTab === 'plans' && (
        <StudentPlansTab
          assignments={assignments}
          allPlans={allPlans}
          studentId={id}
          onRefresh={fetchStudentData}
        />
      )}

      {activeTab === 'progress' && (
        <StudentProgressTab studentId={id} />
      )}

      {activeTab === 'logs' && (
        <StudentLogsTab logs={logs} />
      )}

      {activeTab === 'history' && (
        <StudentHistoryTab editHistory={editHistory} />
      )}
    </div>
  )
}
