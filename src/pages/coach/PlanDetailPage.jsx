import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, Edit2, Users, ExternalLink,
  ChevronDown, ChevronUp, Trash2, Plus, X, UserPlus
} from 'lucide-react'
import { displayReps } from '../../utils/planHelpers'
import { format } from 'date-fns'

const SECTION_LABELS = {
  activation: 'Activación',
  day_a: 'Principal Día A',
  day_b: 'Principal Día B',
}

function ExerciseItem({ ex, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {ex.block_label && (
          <span className="badge bg-primary-100 text-primary-700 flex-shrink-0">{ex.block_label}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {ex.exercise?.name || 'Sin ejercicio'}
          </p>
          <p className="text-xs text-gray-500">
            {[
              ex.suggested_sets && `${ex.suggested_sets} series`,
              ex.suggested_reps && `× ${displayReps(ex.suggested_reps)}`,
              ex.suggested_weight && `· ${ex.suggested_weight}`,
              ex.rest_time && `· ${ex.rest_time} pausa`,
            ].filter(Boolean).join(' ')}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {ex.exercise?.video_url && (
            <a
              href={ex.exercise.video_url.startsWith('http') ? ex.exercise.video_url : '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-200 pt-2">
          {ex.suggested_pse && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">PSE sugerida:</span> {ex.suggested_pse}
            </p>
          )}
          {ex.extra_notes && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">Técnica:</span> {ex.extra_notes}
            </p>
          )}
          {ex.exercise?.technique_notes && (
            <p className="text-xs text-gray-500 italic">{ex.exercise.technique_notes}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onDelete(ex.id)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1">
              <Trash2 size={12} />
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Modal para asignar alumno desde el plan
function AssignStudentModal({ planId, onClose, onDone }) {
  const [students, setStudents] = useState([])
  const [alreadyAssigned, setAlreadyAssigned] = useState(new Set())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, name').eq('role', 'student').order('name'),
      supabase.from('plan_assignments').select('student_id').eq('plan_id', planId).eq('active', true),
    ]).then(([studentsRes, assignRes]) => {
      setStudents(studentsRes.data || [])
      setAlreadyAssigned(new Set((assignRes.data || []).map(a => a.student_id)))
    })
  }, [planId])

  async function handleAssign() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase.from('plan_assignments').insert({
        plan_id: planId,
        student_id: selected,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
      })
      if (error) throw error
      onDone()
    } catch (err) {
      setError(err.message || 'Error al asignar alumno')
    } finally {
      setSaving(false)
    }
  }

  const filtered = students
    .filter(s => s.name?.toLowerCase().includes(search.toLowerCase()))
    .filter(s => !alreadyAssigned.has(s.id))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-primary-600" />
            <h2 className="font-bold text-gray-900">Asignar alumno</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <input
            type="text"
            className="input"
            placeholder="Buscar alumno..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />

          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {students.length === 0 ? 'No hay alumnos registrados' : 'Todos los alumnos ya tienen este plan asignado'}
              </p>
            ) : (
              filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id === selected ? null : s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    selected === s.id
                      ? 'bg-primary-50 border-2 border-primary-400'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 font-semibold text-sm">
                      {s.name?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  {selected === s.id && (
                    <div className="ml-auto w-4 h-4 bg-primary-600 rounded-full" />
                  )}
                </button>
              ))
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button
              onClick={handleAssign}
              disabled={!selected || saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><UserPlus size={14} /> Asignar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)

  useEffect(() => { fetchPlan() }, [id])

  async function fetchPlan() {
    try {
      const [planRes, assignmentsRes] = await Promise.all([
        supabase.from('plans')
          .select(`*, plan_exercises(*, exercise:exercises!exercise_id(*))`)
          .eq('id', id)
          .single(),
        supabase.from('plan_assignments')
          .select('*, student:profiles!student_id(id, name)')
          .eq('plan_id', id)
          .eq('active', true),
      ])
      setPlan(planRes.data)
      setExercises(planRes.data?.plan_exercises || [])
      setAssignments(assignmentsRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function deleteExercise(exId) {
    await supabase.from('plan_exercises').delete().eq('id', exId)
    fetchPlan()
  }

  async function removeAssignment(assignmentId) {
    await supabase.from('plan_assignments').update({ active: false }).eq('id', assignmentId)
    fetchPlan()
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!plan) return <div className="text-center py-12 text-gray-500">Plan no encontrado</div>

  const groupedBySection = {
    activation: exercises.filter(e => e.section === 'activation').sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    day_a: exercises.filter(e => e.section === 'day_a').sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    day_b: exercises.filter(e => e.section === 'day_b').sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {showAssignModal && (
        <AssignStudentModal
          planId={id}
          onClose={() => setShowAssignModal(false)}
          onDone={() => { setShowAssignModal(false); fetchPlan() }}
        />
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{plan.title}</h1>
          {plan.description && <p className="text-sm text-gray-500 truncate">{plan.description}</p>}
        </div>
        <Link to={`/coach/plans/${id}/edit`} className="btn-secondary flex items-center gap-1.5 text-sm">
          <Edit2 size={14} />
          Editar
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">{exercises.length}</p>
          <p className="text-xs text-gray-500">Ejercicios</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">{plan.sessions_per_week || '—'}</p>
          <p className="text-xs text-gray-500">Días/sem</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">{assignments.length}</p>
          <p className="text-xs text-gray-500">Alumnos</p>
        </div>
      </div>

      {/* Assigned students */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <h3 className="font-semibold text-sm text-gray-900">Alumnos asignados</h3>
          </div>
          <button
            onClick={() => setShowAssignModal(true)}
            className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3"
          >
            <Plus size={13} />
            Asignar alumno
          </button>
        </div>

        {assignments.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-400">Ningún alumno tiene este plan asignado</p>
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-secondary text-sm mt-3 flex items-center gap-1.5 mx-auto"
            >
              <UserPlus size={14} />
              Asignar alumno
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-primary-50 rounded-xl px-3 py-1.5">
                <Link
                  to={`/coach/students/${a.student_id}`}
                  className="text-sm font-medium text-primary-700 hover:text-primary-900"
                >
                  {a.student?.name}
                </Link>
                <button
                  onClick={() => removeAssignment(a.id)}
                  className="text-primary-400 hover:text-red-500 transition-colors"
                  title="Desasignar"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exercises by section */}
      {Object.entries(groupedBySection).map(([section, sectionExs]) => (
        <div key={section} className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{SECTION_LABELS[section]}</h3>
            <span className="badge bg-gray-100 text-gray-600">{sectionExs.length} ejercicios</span>
          </div>

          {sectionExs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin ejercicios en esta sección</p>
          ) : (
            <div className="space-y-2">
              {sectionExs.map(ex => (
                <ExerciseItem key={ex.id} ex={ex} onDelete={deleteExercise} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
