import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, GripVertical, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const SECTIONS = [
  { id: 'activation', label: 'Activación' },
  { id: 'day_a', label: 'Principal Día A' },
  { id: 'day_b', label: 'Principal Día B' },
]

const BLOCKS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1']
const PSE_OPTIONS = ['Fácil (1-3)', 'Moderado (4)', 'Duro (5-6)', 'Muy duro (7-9)', 'Esfuerzo máx (10)']

function ExerciseRow({ ex, index, onUpdate, onRemove, exercises }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ejercicio *</label>
            <select
              className="input text-sm"
              value={ex.exercise_id}
              onChange={e => onUpdate(index, 'exercise_id', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {exercises.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bloque</label>
            <select
              className="input text-sm"
              value={ex.block_label}
              onChange={e => onUpdate(index, 'block_label', e.target.value)}
            >
              <option value="">Sin bloque</option>
              {BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Series</label>
            <input
              type="number"
              className="input text-sm"
              placeholder="3"
              value={ex.suggested_sets}
              onChange={e => onUpdate(index, 'suggested_sets', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Repeticiones</label>
            <input
              className="input text-sm"
              placeholder="10 o '8cl' o '30 seg'"
              value={ex.suggested_reps}
              onChange={e => onUpdate(index, 'suggested_reps', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Peso sugerido</label>
            <input
              className="input text-sm"
              placeholder="10kg, corporal..."
              value={ex.suggested_weight}
              onChange={e => onUpdate(index, 'suggested_weight', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Descanso</label>
            <input
              className="input text-sm"
              placeholder="1 min 30 seg"
              value={ex.rest_time}
              onChange={e => onUpdate(index, 'rest_time', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">PSE sugerida</label>
            <select
              className="input text-sm"
              value={ex.suggested_pse}
              onChange={e => onUpdate(index, 'suggested_pse', e.target.value)}
            >
              <option value="">Sin especificar</option>
              {PSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">URL Video</label>
            <input
              className="input text-sm"
              placeholder="https://..."
              value={ex.video_url}
              onChange={e => onUpdate(index, 'video_url', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Notas técnicas</label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Indicaciones técnicas del ejercicio..."
              value={ex.extra_notes}
              onChange={e => onUpdate(index, 'extra_notes', e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0 mt-5"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

export default function CreatePlanPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [plan, setPlan] = useState({
    title: '',
    description: '',
    goal: '',
    sessions_per_week: 3,
    duration_weeks: '',
    is_template: false,
  })

  const [planExercises, setPlanExercises] = useState({
    activation: [],
    day_a: [],
    day_b: [],
  })

  const [activeSection, setActiveSection] = useState('activation')

  useEffect(() => {
    supabase.from('exercises').select('*').order('name').then(({ data }) => {
      setExercises(data || [])
    })
  }, [])

  function addExercise(section) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: [...prev[section], {
        exercise_id: '',
        block_label: section === 'activation' ? '' : 'A1',
        suggested_sets: '',
        suggested_reps: '',
        suggested_weight: '',
        rest_time: '',
        suggested_pse: '',
        extra_notes: '',
        video_url: '',
        order_index: prev[section].length,
      }]
    }))
  }

  function updateExercise(section, index, field, value) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].map((ex, i) =>
        i === index ? { ...ex, [field]: value } : ex
      )
    }))
  }

  function removeExercise(section, index) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index)
    }))
  }

  async function handleSave() {
    if (!plan.title) {
      setError('El nombre del plan es obligatorio')
      return
    }
    setError(null)
    setLoading(true)

    try {
      // Create plan
      const { data: newPlan, error: planError } = await supabase
        .from('plans')
        .insert({ ...plan, created_by: profile.id, sessions_per_week: parseInt(plan.sessions_per_week) || 3 })
        .select()
        .single()
      if (planError) throw planError

      // Create plan exercises
      const allExercises = [
        ...planExercises.activation.map((ex, i) => ({ ...ex, section: 'activation', order_index: i })),
        ...planExercises.day_a.map((ex, i) => ({ ...ex, section: 'day_a', order_index: i })),
        ...planExercises.day_b.map((ex, i) => ({ ...ex, section: 'day_b', order_index: i })),
      ].filter(ex => ex.exercise_id)

      if (allExercises.length > 0) {
        const { error: exError } = await supabase.from('plan_exercises').insert(
          allExercises.map(ex => ({
            plan_id: newPlan.id,
            exercise_id: ex.exercise_id,
            section: ex.section,
            block_label: ex.block_label || null,
            order_index: ex.order_index,
            suggested_sets: ex.suggested_sets ? parseInt(ex.suggested_sets) : null,
            suggested_reps: ex.suggested_reps || null,
            suggested_weight: ex.suggested_weight || null,
            rest_time: ex.rest_time || null,
            suggested_pse: ex.suggested_pse || null,
            extra_notes: ex.extra_notes || null,
          }))
        )
        if (exError) throw exError
      }

      navigate(`/coach/plans/${newPlan.id}`)
    } catch (err) {
      setError(err.message || 'Error al guardar el plan')
    } finally {
      setLoading(false)
    }
  }

  const currentExercises = planExercises[activeSection]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo plan</h1>
      </div>

      {/* Plan info */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Información del plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Nombre del plan *</label>
            <input
              className="input"
              placeholder="Plan 1 - Iniciación"
              value={plan.title}
              onChange={e => setPlan(p => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Descripción del plan..."
              value={plan.description}
              onChange={e => setPlan(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Objetivo</label>
            <input
              className="input"
              placeholder="Fuerza, hipertrofia..."
              value={plan.goal}
              onChange={e => setPlan(p => ({ ...p, goal: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Días por semana</label>
            <input
              type="number"
              min="1"
              max="7"
              className="input"
              value={plan.sessions_per_week}
              onChange={e => setPlan(p => ({ ...p, sessions_per_week: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Duración (semanas)</label>
            <input
              type="number"
              className="input"
              placeholder="Opcional"
              value={plan.duration_weeks}
              onChange={e => setPlan(p => ({ ...p, duration_weeks: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="is_template"
              className="w-4 h-4 rounded text-primary-600"
              checked={plan.is_template}
              onChange={e => setPlan(p => ({ ...p, is_template: e.target.checked }))}
            />
            <label htmlFor="is_template" className="text-sm text-gray-700 cursor-pointer">
              Guardar como plantilla reutilizable
            </label>
          </div>
        </div>
      </div>

      {/* Exercises */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Ejercicios</h2>

        {/* Section tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                activeSection === s.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {s.label}
              {planExercises[s.id].length > 0 && (
                <span className="ml-1 bg-primary-100 text-primary-700 rounded-full px-1.5 text-xs">
                  {planExercises[s.id].length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="space-y-3">
          {currentExercises.map((ex, i) => (
            <ExerciseRow
              key={i}
              ex={ex}
              index={i}
              exercises={exercises}
              onUpdate={(idx, field, value) => updateExercise(activeSection, idx, field, value)}
              onRemove={(idx) => removeExercise(activeSection, idx)}
            />
          ))}
        </div>

        <button
          onClick={() => addExercise(activeSection)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Agregar ejercicio
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={handleSave} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} />
              Guardar plan
            </>
          )}
        </button>
      </div>
    </div>
  )
}
