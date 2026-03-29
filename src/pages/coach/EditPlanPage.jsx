import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Plus, Save, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import PlanExerciseRow from '../../components/plan/PlanExerciseRow'
import {
  SECTIONS, emptyPlanExercise, dbExToUIEx, uiExToDBEx
} from '../../utils/planHelpers'

export default function EditPlanPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  // IDs de ejercicios de plan a eliminar
  const [toDelete, setToDelete] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('plans')
        .select(`*, plan_exercises(*, exercise:exercises!exercise_id(*))`)
        .eq('id', id)
        .single(),
    ]).then(([exRes, planRes]) => {
      setExercises(exRes.data || [])
      if (planRes.data) {
        const p = planRes.data
        setPlan({
          title: p.title || '',
          description: p.description || '',
          goal: p.goal || '',
          sessions_per_week: p.sessions_per_week || 3,
          duration_weeks: p.duration_weeks || '',
          is_template: p.is_template || false,
        })

        // Agrupar ejercicios por sección y convertir a formato UI
        const grouped = { activation: [], day_a: [], day_b: [] }
        ;(p.plan_exercises || [])
          .sort((a, b) => a.order_index - b.order_index)
          .forEach(ex => {
            const section = ex.section || 'activation'
            if (grouped[section]) {
              grouped[section].push(dbExToUIEx(ex))
            }
          })
        setPlanExercises(grouped)
      }
    }).finally(() => setLoading(false))
  }, [id])

  function addExercise(section) {
    const newEx = emptyPlanExercise(section)
    newEx.order_index = planExercises[section].length
    setPlanExercises(prev => ({
      ...prev,
      [section]: [...prev[section], newEx],
    }))
  }

  function updateExercise(section, index, field, value) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].map((ex, i) =>
        i === index ? { ...ex, [field]: value } : ex
      ),
    }))
  }

  function removeExercise(section, index) {
    const ex = planExercises[section][index]
    // Si tiene ID de DB, marcar para borrar
    if (ex.id) setToDelete(prev => [...prev, ex.id])
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }))
  }

  async function handleSave() {
    if (!plan.title.trim()) {
      setError('El nombre del plan es obligatorio')
      return
    }
    setError(null)
    setSaving(true)

    try {
      // 1. Actualizar info del plan
      const { error: planError } = await supabase
        .from('plans')
        .update({
          ...plan,
          sessions_per_week: parseInt(plan.sessions_per_week) || 3,
          duration_weeks: plan.duration_weeks ? parseInt(plan.duration_weeks) : null,
        })
        .eq('id', id)
      if (planError) throw planError

      // 2. Eliminar ejercicios marcados para borrar
      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from('plan_exercises')
          .delete()
          .in('id', toDelete)
        if (delError) throw delError
      }

      // 3. Upsert ejercicios (update si tienen id, insert si son nuevos)
      const allSections = ['activation', 'day_a', 'day_b']
      for (const section of allSections) {
        const sectionExs = planExercises[section].filter(ex => ex.exercise_id)
        for (let i = 0; i < sectionExs.length; i++) {
          const ex = sectionExs[i]
          const dbData = uiExToDBEx(ex, id, section, i)

          if (ex.id) {
            // Update existente
            const { error: upError } = await supabase
              .from('plan_exercises')
              .update(dbData)
              .eq('id', ex.id)
            if (upError) throw upError
          } else {
            // Insert nuevo
            const { error: inError } = await supabase
              .from('plan_exercises')
              .insert(dbData)
            if (inError) throw inError
          }
        }
      }

      navigate(`/coach/plans/${id}`)
    } catch (err) {
      setError(err.message || 'Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const currentExercises = planExercises[activeSection]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Editar plan</h1>
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

      {/* Ejercicios */}
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
            <PlanExerciseRow
              key={ex.id || `new-${i}`}
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

      <div className="flex gap-3 pb-8">
        <button onClick={() => navigate(-1)} className="btn-secondary flex-1">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} />
              Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  )
}
