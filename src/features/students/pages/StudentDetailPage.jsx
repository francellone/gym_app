import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { ArrowLeft, ClipboardEdit } from 'lucide-react'
import { LEVEL_LABELS, MODALITY_LABELS } from '../helpers'
import { getPaymentStatus, getPlanStatus, PAYMENT_STATUS, PLAN_STATUS } from '../status'

// ── Tabs ────────────────────────────────────────────────────
import StudentInfoTab from '../tabs/StudentInfoTab'
import StudentDayTalliesCard from '../components/StudentDayTalliesCard'
import StudentPlansTab from '@/features/plans/pages/StudentPlansTab'
import StudentProgressTab from '../tabs/StudentProgressTab'
import StudentLogsTab from '../tabs/StudentLogsTab'
import StudentHistoryTab from '../tabs/StudentHistoryTab'
import StudentEvaluationsTab from '@/features/evaluations/pages/StudentEvaluationsTab'
import StudentWellbeingTab from '@/features/wellbeing/pages/StudentWellbeingTab'
import StudentActivitiesTab from '@/features/activities/pages/StudentActivitiesTab'
import StudentFormsTab from '../tabs/StudentFormsTab'
import StudentNotesTab from '@/features/notes/pages/StudentNotesTab'
import { useNoteThreadUnread } from '@/features/notes/hooks/useNoteThreadUnread'
import { fetchSingleMirrorBodies } from '@/features/notes/api'

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'notas', label: 'Notas' },
  { id: 'plans', label: 'Planes' },
  { id: 'evaluaciones', label: 'Evaluaciones' },
  { id: 'formularios', label: 'Formularios' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'actividad', label: 'Actividad' },
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
  // ?tab=notas permite deep-linkear a una pestaña concreta (usado por la
  // campana de notificaciones al clickear una notif de nota del alumno).
  // Se valida contra TABS para evitar tabs inexistentes vía URL.
  const [searchParams] = useSearchParams()
  const initialTab = (() => {
    const fromUrl = searchParams.get('tab')
    return TABS.some((t) => t.id === fromUrl) ? fromUrl : 'info'
  })()

  const [student, setStudent] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [logs, setLogs] = useState([])
  const [allPlans, setAllPlans] = useState([])
  const [editHistory, setEditHistory] = useState([])
  const [formAssignment, setFormAssignment] = useState(null)
  const [formSubmission, setFormSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(initialTab)

  // Badge de no-leídas para el tab "Notas" (coach side)
  const { count: notesUnread } = useNoteThreadUnread(id, 'coach')

  useEffect(() => {
    fetchStudentData()
  }, [id])

  async function fetchStudentData() {
    try {
      const [
        studentRes,
        assignmentsRes,
        logsRes,
        plansRes,
        historyRes,
        formAssignmentRes,
        formSubmissionRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        // Traemos status, plan_type denormalizado, linked_assignment_id
        // y replaced_by_assignment_id para que las pestañas Planes y
        // Evaluaciones puedan mostrar estados, vínculos y reemplazos.
        supabase
          .from('plan_assignments')
          .select('*, plan:plans!plan_id(*)')
          .eq('student_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('workout_logs')
          .select(
            `
            *,
            plan_exercise:plan_exercises!plan_exercise_id(
              block_label, section,
              exercise:exercises!exercise_id(name, muscle_group)
            )
          `
          )
          .eq('student_id', id)
          .order('logged_date', { ascending: false })
          .limit(50),
        // Incluimos is_template para que las pestañas Planes y Evaluaciones
        // puedan filtrar la biblioteca: el back rechaza asignar plan instancias
        // como plantillas, y al revés. Solo se asignan plantillas vía RPC
        // assign_template_to_student (ver assignmentHelpers.assignTemplateToStudent).
        supabase
          .from('plans')
          .select('id, title, plan_type, parent_plan_id, is_template')
          .order('title'),
        supabase
          .from('student_edit_history')
          .select('*')
          .eq('student_id', id)
          .order('changed_at', { ascending: false })
          .limit(100),
        supabase
          .from('intake_form_assignments')
          .select('*')
          .eq('student_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('intake_form_submissions')
          .select('*')
          .eq('student_id', id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      setStudent(studentRes.data)
      setAssignments(assignmentsRes.data || [])

      // Round 2a: traer body de notas mirror y mergear con los logs
      // para que las vistas legacy (StudentLogsTab, StudentProgressTableView)
      // sigan funcionando cuando dropeemos workout_logs.notes en round 2b.
      // Mientras tanto, prefer mirror.body sobre log.notes si existe.
      const rawLogs = logsRes.data || []
      const logIds = rawLogs.map((l) => l.id)
      const bodiesMap = await fetchSingleMirrorBodies({
        contextType: 'workout_log',
        contextIds: logIds,
      })
      const logsWithMirror = rawLogs.map((l) => ({
        ...l,
        notes: bodiesMap.get(l.id) ?? l.notes ?? null,
      }))
      setLogs(logsWithMirror)
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
  const initials = student.name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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
        <h1 className="text-xl font-bold text-gray-900 truncate flex-1">{student.name}</h1>
        {/* v33 — registrar entrenamiento en nombre del alumno (modo coach).
            Queda auditado en el back: logged_by = coach, source = 'coach'. */}
        <button
          onClick={() => navigate(`/coach/students/${id}/workout`)}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2 flex-shrink-0"
        >
          <ClipboardEdit size={16} />
          Registrar entrenamiento
        </button>
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
                <span className="badge bg-gray-100 text-gray-600 truncate max-w-40">
                  {student.goal}
                </span>
              )}
              {/* v33: modalidad — solo se muestra si no es la default online */}
              {student.modality && student.modality !== 'online' && (
                <span className="badge bg-violet-100 text-violet-700">
                  {MODALITY_LABELS[student.modality] || student.modality}
                </span>
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

      {/* Q2 — Tildes de días del plan activo (visible siempre, arriba de los tabs) */}
      <StudentDayTalliesCard
        studentId={id}
        activeAssignment={assignments.find(
          (a) =>
            a.status === 'active' && (a.plan_type || a.plan?.plan_type || 'training') === 'training'
        )}
      />

      {/* Tabs de navegación */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all relative ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.id === 'history' && editHistory.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({editHistory.length})</span>
            )}
            {tab.id === 'notas' && notesUnread > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1
                           bg-orange-500 text-white text-[10px] font-bold rounded-full leading-none align-middle"
                title={`${notesUnread} sin leer`}
              >
                {notesUnread > 9 ? '9+' : notesUnread}
              </span>
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
          onOpenNotesTab={() => setActiveTab('notas')}
        />
      )}

      {activeTab === 'notas' && <StudentNotesTab studentId={id} />}

      {activeTab === 'plans' && (
        <StudentPlansTab
          assignments={assignments}
          allPlans={allPlans}
          studentId={id}
          onRefresh={fetchStudentData}
        />
      )}

      {activeTab === 'evaluaciones' && (
        <StudentEvaluationsTab
          studentId={id}
          assignments={assignments}
          allPlans={allPlans}
          onRefresh={fetchStudentData}
        />
      )}

      {activeTab === 'formularios' && <StudentFormsTab studentId={id} />}

      {activeTab === 'wellbeing' && <StudentWellbeingTab studentId={id} />}

      {activeTab === 'actividad' && <StudentActivitiesTab studentId={id} />}

      {activeTab === 'progress' && <StudentProgressTab studentId={id} />}

      {activeTab === 'logs' && <StudentLogsTab logs={logs} />}

      {activeTab === 'history' && <StudentHistoryTab editHistory={editHistory} />}
    </div>
  )
}
