import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Save, AlertCircle, Dumbbell, BarChart2, Tag, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import BlockCard from '../components/blocks/BlockCard'
import { Pct1rmPreviewProvider, Pct1rmPreviewSelector } from '../Pct1rmPreviewContext'
import {
  ExerciseCatalogProvider,
  useExerciseCatalogData,
} from '@/features/exercises/ExerciseCatalogContext'
import AddBlockMenu from '../components/blocks/AddBlockMenu'
import DayBlocksOrderWarning from '../components/blocks/DayBlocksOrderWarning'
import {
  getDynamicSections,
  emptyBlock,
  uiExToDBEx,
  uiBlockToDB,
  reorderByBlockmate,
} from '../helpers'
import {
  EVAL_TYPES,
  METHODS,
  EVAL_TAG_SUGGESTIONS,
  isExerciseBasedEval,
  uiEvalExerciseToDB,
} from '@/features/evaluations/helpers'
import EvaluationParentPlanField from '../components/EvaluationParentPlanField'
import EvalDaysEditor from '../components/EvalDaysEditor'

// ============================================================
// El catálogo de ejercicios se publica por context para que cualquier fila
// del armador pueda leerlo Y darlo de alta sin salir del plan.
export default function CreatePlanPage() {
  const catalog = useExerciseCatalogData()
  return (
    <ExerciseCatalogProvider catalog={catalog}>
      <Pct1rmPreviewProvider>
        <CreatePlanPageInner />
      </Pct1rmPreviewProvider>
    </ExerciseCatalogProvider>
  )
}

function CreatePlanPageInner() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
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
    parent_plan_id: null,
  })

  // Estructura del plan: por sección, una lista de bloques.
  // Cada bloque tiene sus propios ejercicios.
  const [planBlocks, setPlanBlocks] = useState({
    day_a: [],
    day_b: [],
    day_c: [],
  })

  // ¿Algún ejercicio del plan está prescripto por % del máximo? Solo entonces
  // tiene sentido ofrecer la vista previa "como [persona]".
  const planUsesPct1rm = useMemo(
    () =>
      Object.values(planBlocks || {}).some((blocks) =>
        (blocks || []).some((b) =>
          (b.exercises || []).some((e) => e.weight_mode === 'pct_1rm')
        )
      ),
    [planBlocks]
  )


  // Estado para evaluaciones exercise-based (doc 38): ejercicios por día.
  // { day_a: [row], day_b: [row], ... }
  const [evalDays, setEvalDays] = useState({ day_a: [] })
  // Días de la evaluación (sessions_per_week reusado para getDynamicSections).
  const [evalSessionsPerWeek, setEvalSessionsPerWeek] = useState(1)
  // Toggle método (solo aplica a `mixed`).
  const [evalSameMethod, setEvalSameMethod] = useState(true)
  const [evalGlobalType, setEvalGlobalType] = useState('one_rm')
  const [evalGlobalMethod, setEvalGlobalMethod] = useState('brzycki')

  const [evalTags, setEvalTags] = useState([])
  const [tagInput, setTagInput] = useState('')

  const [activeSection, setActiveSection] = useState('day_a')

  // Q7 — banner por día: secciones donde el coach apretó "Dejar como está".
  // Se resetea al desmontar (no persiste entre cargas).
  const [dismissedOrderWarnings, setDismissedOrderWarnings] = useState(() => new Set())

  // Sincronizar planBlocks cuando cambia sessions_per_week o has_activation
  useEffect(() => {
    if (plan.plan_type === 'evaluation') return
    const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
    setPlanBlocks((prev) => {
      const next = {}
      for (const s of sections) next[s.id] = prev[s.id] || []
      return next
    })
    setActiveSection((prev) => {
      if (sections.find((s) => s.id === prev)) return prev
      return sections[0]?.id || 'day_a'
    })
  }, [plan.sessions_per_week, plan.has_activation, plan.plan_type])

  // Sincronizar las secciones de evalDays cuando cambia la cantidad de días.
  useEffect(() => {
    if (plan.plan_type !== 'evaluation') return
    const sections = getDynamicSections(evalSessionsPerWeek, false)
    setEvalDays((prev) => {
      const next = {}
      for (const s of sections) next[s.id] = prev[s.id] || []
      return next
    })
  }, [evalSessionsPerWeek, plan.plan_type])

  // ============================================================
  // Helpers de manipulación de bloques
  // ============================================================
  function addBlock(section, type) {
    setPlanBlocks((prev) => {
      const current = prev[section] || []
      const newBlock = emptyBlock(type, section, current.length)
      return { ...prev, [section]: [...current, newBlock] }
    })
  }

  function updateBlock(section, index, patch) {
    setPlanBlocks((prev) => ({
      ...prev,
      [section]: (prev[section] || []).map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }))
  }

  function updateBlockExercises(section, index, nextExercises) {
    updateBlock(section, index, { exercises: nextExercises })
  }

  // Q7 — Reordena los ejercicios de cada bloque strength del día por (letra, número).
  // Los ejercicios sin letra quedan en su slot original (no se mueven).
  function reorderSectionStrength(section) {
    setPlanBlocks((prev) => ({
      ...prev,
      [section]: (prev[section] || []).map((b) =>
        b.block_type === 'strength' ? { ...b, exercises: reorderByBlockmate(b.exercises || []) } : b
      ),
    }))
  }

  function dismissOrderWarning(section) {
    setDismissedOrderWarnings((prev) => {
      const next = new Set(prev)
      next.add(section)
      return next
    })
  }

  function removeBlock(section, index) {
    setPlanBlocks((prev) => ({
      ...prev,
      [section]: (prev[section] || [])
        .filter((_, i) => i !== index)
        .map((b, i) => ({ ...b, order_index: i })),
    }))
  }

  function moveBlock(section, index, direction) {
    const j = index + direction
    setPlanBlocks((prev) => {
      const list = [...(prev[section] || [])]
      if (j < 0 || j >= list.length) return prev
      const [item] = list.splice(index, 1)
      list.splice(j, 0, item)
      return { ...prev, [section]: list.map((b, i) => ({ ...b, order_index: i })) }
    })
  }

  // ============================================================
  // Construir filas de plan_exercises para una eval exercise-based.
  // Aplica el modo "mismo método para todos" (propaga tipo+método global)
  // o "por ejercicio" (cada fila conserva su tipo+método).
  // ============================================================
  function buildEvalExerciseRows(planId) {
    const isMixed = plan.eval_type === 'mixed'
    const sections = getDynamicSections(evalSessionsPerWeek, false)
    const rows = []
    for (const s of sections) {
      const dayRows = (evalDays[s.id] || []).filter((r) => r.exercise_id)
      dayRows.forEach((row, i) => {
        let effType = row.eval_type
        let effMethod = row.eval_method
        if (!isMixed) {
          // Tipos fijos: todas las filas heredan el tipo+método del plan.
          effType = plan.eval_type
          effMethod = plan.eval_method || row.eval_method || null
        } else if (evalSameMethod) {
          // Mixta "mismo para todos": propagar tipo+método global.
          effType = evalGlobalType
          effMethod = evalGlobalMethod || null
        }
        rows.push(
          uiEvalExerciseToDB(
            { ...row, eval_type: effType, eval_method: effMethod },
            planId,
            s.id,
            i
          )
        )
      })
    }
    return rows
  }

  // ============================================================
  // Guardar
  // ============================================================
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
    setLoading(true)

    try {
      const { data: newPlan, error: planError } = await supabase
        .from('plans')
        .insert({
          title: plan.title,
          description: plan.description,
          goal: plan.goal,
          // Para evaluaciones exercise-based los "días" se guardan en
          // sessions_per_week (lo usa getDynamicSections al leer/editar).
          sessions_per_week:
            plan.plan_type === 'evaluation'
              ? parseInt(evalSessionsPerWeek) || 1
              : parseInt(plan.sessions_per_week) || 3,
          has_activation: plan.plan_type === 'training' ? plan.has_activation : false,
          duration_weeks: plan.duration_weeks ? parseInt(plan.duration_weeks) : null,
          // B4 + Q10 (24/05): para TODO plan_type forzamos is_template=true
          // en el create. La distinción "plantilla vs no-plantilla" desde el
          // lado del coach no tiene sentido conceptual (las "instancias
          // personales" se generan automáticamente al asignar vía
          // assign_template_to_student). El checkbox UI también se eliminó
          // abajo. Q10 extendió el patrón de B4 a training: antes un plan
          // training sin tildar el checkbox quedaba inasignable (cartel
          // "Plan personalizado (sin alumnos para asignar).").
          is_template: true,
          plan_type: plan.plan_type,
          eval_type: plan.plan_type === 'evaluation' ? plan.eval_type : null,
          // Para `mixed` el método vive por ejercicio → plan.eval_method = null.
          eval_method:
            plan.plan_type === 'evaluation' && plan.eval_type !== 'mixed'
              ? plan.eval_method || null
              : null,
          eval_tags: plan.plan_type === 'evaluation' ? evalTags : [],
          // Asociación template-level a un plan padre (solo para evaluaciones).
          parent_plan_id: plan.plan_type === 'evaluation' ? plan.parent_plan_id || null : null,
          created_by: profile.id,
        })
        .select()
        .single()
      if (planError) throw planError

      if (plan.plan_type === 'evaluation') {
        // Evaluaciones exercise-based (doc 38): un solo cajón = plan_exercises.
        // Cada ejercicio lleva su eval_type + eval_method por día (section).
        const rows = buildEvalExerciseRows(newPlan.id)
        if (rows.length > 0) {
          const { error: exError } = await supabase.from('plan_exercises').insert(rows)
          if (exError) throw exError
        }
      } else {
        // Entrenamiento: insertar bloques y sus ejercicios
        const dynamicSections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
        for (const s of dynamicSections) {
          const blocks = planBlocks[s.id] || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi]
            const blockPayload = uiBlockToDB(block, newPlan.id, bi)
            const { data: insertedBlock, error: bErr } = await supabase
              .from('plan_blocks')
              .insert(blockPayload)
              .select()
              .single()
            if (bErr) throw bErr

            const exRows = (block.exercises || [])
              .filter((ex) => ex.exercise_id)
              .map((ex, i) => uiExToDBEx(ex, newPlan.id, s.id, i, insertedBlock.id))

            if (exRows.length > 0) {
              const { error: eErr } = await supabase.from('plan_exercises').insert(exRows)
              if (eErr) throw eErr
            }
          }
        }
      }

      navigate(`/coach/plans/${newPlan.id}`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al guardar el plan')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // Helpers de tags (evaluación)
  // ============================================================
  function addTag(tag) {
    const t = tag.trim()
    if (!t || evalTags.includes(t)) return
    setEvalTags((prev) => [...prev, t])
    setTagInput('')
  }

  function removeTag(tag) {
    setEvalTags((prev) => prev.filter((t) => t !== tag))
  }

  const isEval = plan.plan_type === 'evaluation'
  const dynamicSections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
  const currentBlocks = planBlocks[activeSection] || []

  // Índice de bloques strength para numerar "Fuerza 1", "Fuerza 2"...
  const strengthCounts = {}
  const strengthIndexMap = currentBlocks.map((b) => {
    if (b.block_type !== 'strength') return 0
    strengthCounts[activeSection] = strengthCounts[activeSection] || 0
    const idx = strengthCounts[activeSection]
    strengthCounts[activeSection] += 1
    return idx
  })

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

        {/* Tipo de plan */}
        <div>
          <label className="label">Tipo de plan</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPlan((p) => ({ ...p, plan_type: 'training', eval_type: '' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'training'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Dumbbell
                size={18}
                className={plan.plan_type === 'training' ? 'text-primary-600' : 'text-gray-400'}
              />
              <div>
                <p
                  className={`text-sm font-semibold ${plan.plan_type === 'training' ? 'text-primary-700' : 'text-gray-700'}`}
                >
                  Entrenamiento
                </p>
                <p className="text-xs text-gray-400">Rutina regular</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPlan((p) => ({ ...p, plan_type: 'evaluation' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'evaluation'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <BarChart2
                size={18}
                className={plan.plan_type === 'evaluation' ? 'text-purple-600' : 'text-gray-400'}
              />
              <div>
                <p
                  className={`text-sm font-semibold ${plan.plan_type === 'evaluation' ? 'text-purple-700' : 'text-gray-700'}`}
                >
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
            <div className="space-y-1.5">
              {EVAL_TYPES.map((et) => (
                <button
                  key={et.key}
                  type="button"
                  onClick={() => setPlan((p) => ({ ...p, eval_type: et.key, eval_method: '' }))}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    plan.eval_type === et.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{et.icon}</span>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-semibold ${plan.eval_type === et.key ? 'text-purple-700' : 'text-gray-700'}`}
                    >
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

        {isEval && plan.eval_type && METHODS[plan.eval_type]?.length > 0 && (
          <div>
            <label className="label">Método / Protocolo</label>
            <div className="space-y-1.5">
              {METHODS[plan.eval_type].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPlan((p) => ({ ...p, eval_method: m.key }))}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    plan.eval_method === m.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex-1">
                    <p
                      className={`text-sm font-semibold ${plan.eval_method === m.key ? 'text-purple-700' : 'text-gray-700'}`}
                    >
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
              onChange={(e) => setPlan((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Descripción del plan..."
              value={plan.description}
              onChange={(e) => setPlan((p) => ({ ...p, description: e.target.value }))}
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
                  onChange={(e) => setPlan((p) => ({ ...p, goal: e.target.value }))}
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
                  onChange={(e) => setPlan((p) => ({ ...p, sessions_per_week: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Duración (semanas)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Opcional"
                  value={plan.duration_weeks}
                  onChange={(e) => setPlan((p) => ({ ...p, duration_weeks: e.target.value }))}
                />
              </div>

              <div
                className={`sm:col-span-2 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  plan.has_activation
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
                onClick={() => setPlan((p) => ({ ...p, has_activation: !p.has_activation }))}
              >
                <input
                  type="checkbox"
                  id="has_activation"
                  className="w-4 h-4 rounded text-amber-500 pointer-events-none"
                  checked={plan.has_activation}
                  readOnly
                />
                <label htmlFor="has_activation" className="cursor-pointer flex-1">
                  <span
                    className={`text-sm font-medium ${plan.has_activation ? 'text-amber-800' : 'text-gray-700'}`}
                  >
                    Incluir bloque de Activación
                  </span>
                  <span className="text-xs text-gray-400 block">
                    Movilidad, activación neuromuscular, calentamiento, etc.
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Tags de evaluación */}
          {isEval && (
            <div>
              <label className="label flex items-center gap-1.5">
                <Tag size={13} className="text-gray-400" />
                Tags de la evaluación
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {evalTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="hover:text-purple-900"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Ej: Fuerza, Movilidad..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag(tagInput)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addTag(tagInput)}
                  className="btn-secondary text-sm px-3"
                >
                  Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {EVAL_TAG_SUGGESTIONS.filter((s) => !evalTags.includes(s))
                  .slice(0, 6)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addTag(s)}
                      className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-full transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Plan padre (solo evaluaciones) */}
          {plan.plan_type === 'evaluation' && (
            <div className="sm:col-span-2">
              <EvaluationParentPlanField
                value={plan.parent_plan_id}
                onChange={(v) => setPlan((p) => ({ ...p, parent_plan_id: v }))}
                excludeId={null}
              />
            </div>
          )}

          {/* B4 + Q10 (24/05): el checkbox is_template se eliminó tanto
              para evaluaciones como para training. Todo plan nuevo se crea
              como plantilla asignable; las "instancias personales" del
              alumno son clones automáticos vía assign_template_to_student. */}
        </div>
      </div>

      {/* ============================================================
           EVALUACIÓN exercise-based (doc 38): ejercicios por día +
           método por ejercicio.
         ============================================================ */}
      {isEval && isExerciseBasedEval(plan.eval_type) && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Ejercicios a evaluar</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Organizados por día. Se mostrarán en el formulario del alumno.
              </p>
            </div>
            <div className="w-24">
              <label className="label text-xs">Días</label>
              <input
                type="number"
                min="1"
                max="7"
                className="input text-sm"
                value={evalSessionsPerWeek}
                onChange={(e) => setEvalSessionsPerWeek(e.target.value)}
              />
            </div>
          </div>
          <EvalDaysEditor
            planEvalType={plan.eval_type}
            sessionsPerWeek={evalSessionsPerWeek}
            evalDays={evalDays}
            onChange={setEvalDays}
            sameMethod={evalSameMethod}
            onSameMethodChange={setEvalSameMethod}
            globalType={evalGlobalType}
            globalMethod={evalGlobalMethod}
            onGlobalChange={({ type, method }) => {
              setEvalGlobalType(type)
              setEvalGlobalMethod(method)
            }}
          />
        </div>
      )}

      {/* ============================================================
           ENTRENAMIENTO: secciones con bloques
         ============================================================ */}
      {!isEval && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Bloques del plan</h2>

          {/* %RM: ver los kilos que le tocarían a una persona concreta */}
          <Pct1rmPreviewSelector visible={planUsesPct1rm} />

          {/* Tabs de secciones */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {dynamicSections.map((s) => {
              const blockCount = (planBlocks[s.id] || []).length
              return (
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
                  {blockCount > 0 && (
                    <span className="ml-1 bg-primary-100 text-primary-700 rounded-full px-1.5 text-xs">
                      {blockCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            {currentBlocks.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">
                Esta sección no tiene bloques todavía.
              </p>
            )}

            {currentBlocks.map((block, i) => (
              <BlockCard
                key={i}
                block={block}
                blockIndexInSection={i}
                strengthIndexInSection={strengthIndexMap[i]}
                onUpdate={(patch) => updateBlock(activeSection, i, patch)}
                onUpdateExercises={(next) => updateBlockExercises(activeSection, i, next)}
                onRemove={() => removeBlock(activeSection, i)}
                onMove={(dir) => moveBlock(activeSection, i, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < currentBlocks.length - 1}
              />
            ))}

            {!dismissedOrderWarnings.has(activeSection) && (
              <DayBlocksOrderWarning
                dayBlocks={currentBlocks}
                onReorderDay={() => reorderSectionStrength(activeSection)}
                onDismiss={() => dismissOrderWarning(activeSection)}
              />
            )}

            <AddBlockMenu onAdd={(type) => addBlock(activeSection, type)} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3 pb-8">
        <button onClick={() => navigate(-1)} className="btn-secondary flex-1">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Guardar plan
            </>
          )}
        </button>
      </div>
    </div>
  )
}
