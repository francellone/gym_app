import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, Edit2, Users, Dumbbell, ExternalLink,
  ChevronDown, ChevronUp, Plus, Trash2, Save
} from 'lucide-react'
import { displayReps } from '../../utils/planHelpers'

const SECTION_LABELS = {
  activation: 'Activación',
  day_a: 'Principal Día A',
  day_b: 'Principal Día B',
}

function ExerciseItem({ ex, onEdit, onDelete }) {
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

export default function PlanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])

  useEffect(() => { fetchPlan() }, [id])

  async function fetchPlan() {
    try {
      const [planRes, assignmentsRes] = await Promise.all([
        supabase.from('plans')
          .select(`
            *,
            plan_exercises(
              *,
              exercise:exercises!exercise_id(*)
            )
          `)
          .eq('id', id)
          .single(),
        supabase.from('plan_assignments')
          .select('*, student:profiles!student_id(name)')
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

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!plan) return <div className="text-center py-12 text-gray-500">Plan no encontrado</div>

  const groupedBySection = {
    activation: exercises.filter(e => e.section === 'activation').sort((a, b) => a.order_index - b.order_index),
    day_a: exercises.filter(e => e.section === 'day_a').sort((a, b) => a.order_index - b.order_index),
    day_b: exercises.filter(e => e.section === 'day_b').sort((a, b) => a.order_index - b.order_index),
  }

  return (
    <div className="space-y-5 max-w-2xl">
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
      {assignments.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-gray-500" />
            <h3 className="font-semibold text-sm text-gray-900">Alumnos con este plan</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignments.map(a => (
              <Link
                key={a.id}
                to={`/coach/students/${a.student_id}`}
                className="badge bg-primary-50 text-primary-700 hover:bg-primary-100"
              >
                {a.student?.name}
              </Link>
            ))}
          </div>
        </div>
      )}

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
