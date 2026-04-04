import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Plus, Save, AlertCircle, Dumbbell, BarChart2 } from 'lucide-react'
import PlanExerciseRow from '../../components/plan/PlanExerciseRow'
import {
  getDynamicSections, emptyPlanExercise, dbExToUIEx, uiExToDBEx
} from '../../utils/planHelpers'
import { EVAL_TYPES, METHODS } from '../../utils/evalHelpers'

export default function EditPlanPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exercises, setExercises] = useState([])
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [plan, setPlan] = useState({
    title: '',
    description: '',
    goal: '',
    sessions_per_week: 3,
    has_activation: false,
    duration_weeks: '',
    is_template: false,
    plan_type: 'training',
    eval_type: '',
    eval_method: '',
  })

  // Estado de ejercicios: keys dinámicas (se poblan al cargar)
  const [planExercises, setPlanExercises] = useState({})
  const [activeSection, setActiveSection] = useState('day_a')
  const [toDelete, setToDelete] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
      supabase.from('plans')
        .select(`*, plan_exercises(*, exercise:exercises!exercise_id(*))`)
        .eq('id', id)
        .single(),
    ]).then(([exRes, tagsRes, assignRes, planRes]) => {
      setExercises(exRes.data || [])
      setExerciseTags(tagsRes.data || [])
      setTagAssignments(assignRes.data || [])

      if (planRes.data) {
        const p = planRes.data
        const loadedPlan = {
          title: p.title || '',
          description: p.description || '',
          goal: p.goal || '',
          sessions_per_week: p.sessions_per_week || 3,
          has_activation: p.has_activation || false,
          duration_weeks: p.duration_weeks || '',
          is_template: p.is_template || false,
          plan_type: p.plan_type || 'training',
          eval_type: p.eval_type || '',
          eval_method: p.eval_method || '',
        }
        setPlan(loadedPlan)

        // Generar secciones según la config cargada
        const sections = getDynamicSections(
          loadedPlan.sessions_per_week,
          loadedPlan.has_activation
        )

        // Inicializar todas las secciones vacías
        const grouped = {}
        for (const s of sections) {
          grouped[s.id] = []
        }

        // Distribuir ejercicios en sus secciones
        ;(p.plan_exercises || [])
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
          .forEach(ex => {
            const section = ex.section || 'day_a'
            if (grouped[section] !== undefined) {
              grouped[section].push(dbExToUIEx(ex))
            } else {
              // Sección no esperada: crearla igualmente para no perder datos
              grouped[section] = [dbExToUIEx(ex)]
            }
          })

        setPlanExercises(grouped)

        // Activar primera sección disponible
        setActiveSection(sections[0]?.id || 'day_a')
      }
    }).catch(err => {
      setError(err.message || 'Error al cargar el plan')
    }).finally(() => setLoading(false))
  }, [id])

  // Sincronizar planExercises cuando el coach cambia sessions_per_week o has_activation
  useEffect(() => {
    if (loading) return // No ajustar mientras se está cargando
    if (plan.plan_type === 'evaluation') return

    const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)

    setPlanExercises(prev => {
      const next = {}
      for (const s of sections) {
        next[s.id] = prev[s.id] || []
      }
      return next
    })

    setActiveSection(prev => {
      if (sections.find(s => s.id === prev)) return prev
      return sections[0]?.id || 'day_a'
    })
  }, [plan.sessions_per_week, plan.has_activation, plan.plan_type, loading])

  function addExercise(section) {
    const newEx = emptyPlanExercise(section)
    newEx.order_index = (planExercises[section] || []).length
    setPlanExercises(prev => ({
      ...prev,
      [section]: [...(prev[section] || []), newEx],
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
    if (plan.plan_type === 'evaluation' && !plan.eval_type) {
      setError('Seleccioná el tipo de evaluación')
      return
    }
    setError(null)
    setSaving(true)

    try {
      // 1. Actualizar info del plan
      const { error: planError } = await supabase
        .from('plans')
        .update({
          title: plan.title,
          description: plan.description,
          goal: plan.goal,
          sessions_per_week: parseInt(plan.sessions_per_week) || 3,
          has_activation: plan.plan_type === 'training' ? plan.has_activation : false,
          duration_weeks: plan.duration_weeks ? parseInt(plan.duration_weeks) : null,
          is_template: plan.is_template,
          plan_type: plan.plan_type,
          eval_type: plan.plan_type === 'evaluation' ? plan.eval_type : null,
          eval_method: plan.plan_type === 'evaluation' ? plan.eval_method || null : null,
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

      // 3. Upsert ejercicios usando secciones dinámicas
      const sectionsToSave = plan.plan_type === 'evaluation'
        ? [{ id: 'day_a' }]
        : getDynamicSections(plan.sessions_per_week, plan.has_activation)

      for (const s of sectionsToSave) {
        const sectionExs = (planExercises[s.id] || []).filter(ex => ex.exercise_id)
        for (let i = 0; i < sectionExs.length; i++) {
          const ex = sectionExs[i]
          const dbData = uiExToDBEx(ex, id, s.id, i)

          if (ex.id) {
            const { error: upError } = await supabase
              .from('plan_exercises')
              .update(dbData)
              .eq('id', ex.id)
            if (upError) throw upError
          } else {
            const { error: inError } = await supabase
              .from('plan_exercises')
              .insert(dbData)
            if (inError) throw inError
          }
        }
      }

      // 4. Navegar al detalle correcto según tipo
      if (plan.plan_type === 'evaluation') {
        navigate(`/coach/evaluations/${id}`)
      } else {
        navigate(`/coach/plans/${id}`)
      }
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

  const isEval = plan.plan_type === 'evaluation'
  const dynamicSections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
  const currentExercises = planExercises[activeSection] || []

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

        {/* Tipo de plan */}
        <div>
          <label className="label">Tipo de plan</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPlan(p => ({ ...p, plan_type: 'training', eval_type: '' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'training'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Dumbbell size={18} className={plan.plan_type === 'training' ? 'text-primary-600' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${plan.plan_type === 'training' ? 'text-primary-700' : 'text-gray-700'}`}>
                  Entrenamiento
                </p>
                <p className="text-xs text-gray-400">Rutina regular</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPlan(p => ({ ...p, plan_type: 'evaluation' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'evaluation'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <BarChart2 size={18} className={plan.plan_type === 'evaluation' ? 'text-purple-600' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${plan.plan_type === 'evaluation' ? 'text-purple-700' : 'text-gray-700'}`}>
                  Evaluación
                </p>
                <p className="text-xs text-gray-400">Protocolo de test</p>
              </div>
            </button>
          </div>
        </div>

        {/* Categoría de evaluación */}
        {isEval && (
          <div>
            <label className="label">Categoría de evaluación</label>
            <div className="grid grid-cols-1 gap-1.5">
              {EVAL_TYPES.map(et => (
                <button
                  key={et.key}
                  type="button"
                  onClick={() => setPlan(p => ({ ...p, eval_type: et.key, eval_method: '' }))}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    plan.eval_type === et.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{et.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${plan.eval_type === et.key ? 'text-purple-700' : 'text-gray-700'}`}>
                      {et.label}
                    </p>
                    <p className="text-xs text-gray-400">{et.description}</p>
                  </div>
                  {plan.eval_type === et.key && (
                    <div className="w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Método del protocolo */}
        {isEval && plan.eval_type && METHODS[plan.eval_type]?.length > 0 && (
          <div>
            <label className="label">Método / Protocolo</label>
            <div className="space-y-1.5">
              {METHODS[plan.eval_type].map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPlan(p => ({ ...p, eval_method: m.key }))}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    plan.eval_method === m.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${plan.eval_method === m.key ? 'text-purple-700' : 'text-gray-700'}`}>
                      {m.label}
                    </p>
                    <p className="text-xs text-gray-400">{m.note}</p>
                  </div>
                  {plan.eval_method === m.key && (
                    <div className="w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

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

          {!isEval && (
            <>
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
                  type="number" min="1" max="7" className="input"
                  value={plan.sessions_per_week}
                  onChange={e => setPlan(p => ({ ...p, sessions_per_week: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Duración (semanas)</label>
                <input
                  type="number" className="input" placeholder="Opcional"
                  value={plan.duration_weeks}
                  onChange={e => setPlan(p => ({ ...p, duration_weeks: e.target.value }))}
                />
              </div>

              {/* Toggle de Activación */}
              <div
                className={`sm:col-span-2 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  plan.has_activation
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
                onClick={() => setPlan(p => ({ ...p, has_activation: !p.has_activation }))}
              >
                <input
                  type="checkbox"
                  id="has_activation"
                  className="w-4 h-4 rounded text-amber-500 pointer-events-none"
                  checked={plan.has_activation}
                  readOnly
                />
                <label htmlFor="has_activation" className="cursor-pointer flex-1">
                  <span className={`text-sm font-medium ${plan.has_activation ? 'text-amber-800' : 'text-gray-700'}`}>
                    Incluir bloque de Activación
                  </span>
                  <span className="text-xs text-gray-400 block">
                    Movilidad, activación neuromuscular, calentamiento, etc.
                  </span>
                </label>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox" id="is_template"
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

      {/* Ejercicios — solo para planes de entrenamiento o evals que lo requieren */}
      {(!isEval || ['one_rm', 'max_reps'].includes(plan.eval_type)) && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isEval ? 'Ejercicios a evaluar' : 'Ejercicios'}
            </h2>
            {isEval && (
              <p className="text-xs text-gray-400 mt-0.5">
                Estos ejercicios se mostrarán en el formulario del alumno para que registre su desempeño.
              </p>
            )}
          </div>

          {/* Tabs de secciones dinámicas */}
          {!isEval && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {dynamicSections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex-shrink-0 py-2 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    activeSection === s.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s.label}
                  {(planExercises[s.id]?.length || 0) > 0 && (
                    <span className="ml-1 bg-primary-100 text-primary-700 rounded-full px-1.5 text-xs">
                      {planExercises[s.id].length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {(isEval ? planExercises['day_a'] || [] : currentExercises).map((ex, i) => (
              <PlanExerciseRow
                key={ex.id || `new-${i}`}
                ex={ex}
                index={i}
                exercises={exercises}
                exerciseTags={exerciseTags}
                tagAssignments={tagAssignments}
                onUpdate={(idx, field, value) => updateExercise(isEval ? 'day_a' : activeSection, idx, field, value)}
                onRemove={(idx) => removeExercise(isEval ? 'day_a' : activeSection, idx)}
              />
            ))}
          </div>

          <button
            onClick={() => addExercise(isEval ? 'day_a' : activeSection)}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} />
            Agregar ejercicio
          </button>
        </div>
      )}

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
            <><Save size={16} /> Guardar cambios</>
          )}
        </button>
      </div>
    </div>
  )
}
