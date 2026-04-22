import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Save, AlertCircle, Dumbbell, BarChart2, Plus } from 'lucide-react'
import PlanExerciseRow from '../../components/plan/PlanExerciseRow'
import BlockCard from '../../components/plan/blocks/BlockCard'
import AddBlockMenu from '../../components/plan/blocks/AddBlockMenu'
import {
  getDynamicSections,
  emptyPlanExercise,
  emptyBlock,
  dbBlockToUI,
  dbExToUIEx,
  uiExToDBEx,
  uiBlockToDB,
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

  // { day_a: [block, block], day_b: [block], ... }
  const [planBlocks, setPlanBlocks] = useState({})
  // Evaluaciones: lista plana
  const [evalExercises, setEvalExercises] = useState([])
  const [activeSection, setActiveSection] = useState('day_a')

  // IDs para borrar al guardar
  const [toDeleteBlocks, setToDeleteBlocks] = useState([])
  const [toDeleteExercises, setToDeleteExercises] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
      supabase.from('plans')
        .select(`
          *,
          plan_blocks(*),
          plan_exercises(*, exercise:exercises!exercise_id(*))
        `)
        .eq('id', id)
        .single(),
    ]).then(([exRes, tagsRes, assignRes, planRes]) => {
      setExercises(exRes.data || [])
      setExerciseTags(tagsRes.data || [])
      setTagAssignments(assignRes.data || [])

      if (!planRes.data) return

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

      if (loadedPlan.plan_type === 'evaluation') {
        // Lista plana
        const evals = (p.plan_exercises || [])
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
          .map(dbExToUIEx)
        setEvalExercises(evals)
        setActiveSection('day_a')
      } else {
        // Armar blocks por sección con sus ejercicios anidados
        const sections = getDynamicSections(
          loadedPlan.sessions_per_week,
          loadedPlan.has_activation
        )

        const exsByBlock = {}
        const orphansBySection = {}
        for (const ex of (p.plan_exercises || [])) {
          if (ex.block_id) {
            if (!exsByBlock[ex.block_id]) exsByBlock[ex.block_id] = []
            exsByBlock[ex.block_id].push(ex)
          } else {
            // huérfanos (deberían ser cero tras v14; fallback por seguridad)
            const sec = ex.section || 'day_a'
            if (!orphansBySection[sec]) orphansBySection[sec] = []
            orphansBySection[sec].push(ex)
          }
        }

        const grouped = {}
        for (const s of sections) grouped[s.id] = []

        // Bloques reales
        for (const b of (p.plan_blocks || [])) {
          const sec = b.section
          if (grouped[sec] === undefined) grouped[sec] = []
          grouped[sec].push(dbBlockToUI(b, exsByBlock[b.id] || []))
        }

        // Huérfanos: envolver en bloque strength virtual
        for (const sec of Object.keys(orphansBySection)) {
          if (grouped[sec] === undefined) grouped[sec] = []
          const strength = emptyBlock('strength', sec, grouped[sec].length)
          strength.exercises = orphansBySection[sec]
            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
            .map(e => {
              const ui = dbExToUIEx(e)
              ui.exercise_mode = e.exercise_mode || 'reps'
              ui.duration_seconds = e.duration_seconds != null ? String(e.duration_seconds) : ''
              return ui
            })
          grouped[sec].push(strength)
        }

        // Ordenar cada sección por order_index
        for (const k of Object.keys(grouped)) {
          grouped[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        }

        setPlanBlocks(grouped)
        setActiveSection(sections[0]?.id || 'day_a')
      }
    }).catch(err => {
      console.error(err)
      setError(err.message || 'Error al cargar el plan')
    }).finally(() => setLoading(false))
  }, [id])

  // Sincronizar secciones cuando cambia sessions_per_week / has_activation
  useEffect(() => {
    if (loading) return
    if (plan.plan_type === 'evaluation') return
    const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
    setPlanBlocks(prev => {
      const next = {}
      for (const s of sections) next[s.id] = prev[s.id] || []
      // Mover a delete los bloques de secciones que desaparecieron
      for (const k of Object.keys(prev)) {
        if (!sections.find(s => s.id === k)) {
          for (const b of (prev[k] || [])) {
            if (b.id) setToDeleteBlocks(prevDel => [...prevDel, b.id])
            for (const ex of (b.exercises || [])) {
              if (ex.id) setToDeleteExercises(prevDel => [...prevDel, ex.id])
            }
          }
        }
      }
      return next
    })
    setActiveSection(prev => {
      if (sections.find(s => s.id === prev)) return prev
      return sections[0]?.id || 'day_a'
    })
  }, [plan.sessions_per_week, plan.has_activation, plan.plan_type, loading])

  // ============================================================
  // Manipulación de bloques
  // ============================================================
  function addBlock(section, type) {
    setPlanBlocks(prev => {
      const current = prev[section] || []
      const newBlock = emptyBlock(type, section, current.length)
      return { ...prev, [section]: [...current, newBlock] }
    })
  }

  function updateBlock(section, index, patch) {
    setPlanBlocks(prev => ({
      ...prev,
      [section]: (prev[section] || []).map((b, i) =>
        i === index ? { ...b, ...patch } : b
      ),
    }))
  }

  function updateBlockExercises(section, index, nextExercises) {
    const prevBlock = (planBlocks[section] || [])[index]
    if (prevBlock) {
      const prevIds = new Set((prevBlock.exercises || []).map(e => e.id).filter(Boolean))
      const nextIds = new Set(nextExercises.map(e => e.id).filter(Boolean))
      const removed = [...prevIds].filter(i => !nextIds.has(i))
      if (removed.length) setToDeleteExercises(d => [...d, ...removed])
    }
    updateBlock(section, index, { exercises: nextExercises })
  }

  function removeBlock(section, index) {
    setPlanBlocks(prev => {
      const block = (prev[section] || [])[index]
      if (block?.id) setToDeleteBlocks(d => [...d, block.id])
      // Los ejercicios se borran por cascada en DB, pero igual los trackeamos
      // por si quedaron sin block_id en modo virtual.
      for (const ex of (block?.exercises || [])) {
        if (ex.id && !block?.id) setToDeleteExercises(d => [...d, ex.id])
      }
      return {
        ...prev,
        [section]: (prev[section] || []).filter((_, i) => i !== index)
          .map((b, i) => ({ ...b, order_index: i })),
      }
    })
  }

  function moveBlock(section, index, direction) {
    const j = index + direction
    setPlanBlocks(prev => {
      const list = [...(prev[section] || [])]
      if (j < 0 || j >= list.length) return prev
      const [item] = list.splice(index, 1)
      list.splice(j, 0, item)
      return { ...prev, [section]: list.map((b, i) => ({ ...b, order_index: i })) }
    })
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
    setSaving(true)

    try {
      // 1. Update plan
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

      // 2. Borrar bloques marcados (cascade borra sus exercises también)
      if (toDeleteBlocks.length > 0) {
        const { error: dErr } = await supabase
          .from('plan_blocks')
          .delete()
          .in('id', toDeleteBlocks)
        if (dErr) throw dErr
      }

      // 3. Borrar ejercicios marcados (huérfanos o removidos de un bloque vivo)
      if (toDeleteExercises.length > 0) {
        const { error: eErr } = await supabase
          .from('plan_exercises')
          .delete()
          .in('id', toDeleteExercises)
        if (eErr) throw eErr
      }

      if (plan.plan_type === 'evaluation') {
        // Evaluaciones: upsert plano
        for (let i = 0; i < evalExercises.length; i++) {
          const ex = evalExercises[i]
          if (!ex.exercise_id) continue
          const dbData = uiExToDBEx(ex, id, 'day_a', i, null)
          if (ex.id) {
            const { error: uErr } = await supabase
              .from('plan_exercises').update(dbData).eq('id', ex.id)
            if (uErr) throw uErr
          } else {
            const { error: iErr } = await supabase
              .from('plan_exercises').insert(dbData)
            if (iErr) throw iErr
          }
        }
      } else {
        // Entrenamiento: upsert bloques + ejercicios
        const sectionsToSave = getDynamicSections(plan.sessions_per_week, plan.has_activation)
        for (const s of sectionsToSave) {
          const blocks = planBlocks[s.id] || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi]
            const blockPayload = uiBlockToDB(block, id, bi)

            let blockId = block.id
            if (blockId) {
              const { error: bErr } = await supabase
                .from('plan_blocks')
                .update(blockPayload)
                .eq('id', blockId)
              if (bErr) throw bErr
            } else {
              const { data: inserted, error: bErr } = await supabase
                .from('plan_blocks')
                .insert(blockPayload)
                .select()
                .single()
              if (bErr) throw bErr
              blockId = inserted.id
            }

            // Ejercicios del bloque
            const exs = (block.exercises || []).filter(ex => ex.exercise_id)
            for (let i = 0; i < exs.length; i++) {
              const ex = exs[i]
              const dbData = uiExToDBEx(ex, id, s.id, i, blockId)
              if (ex.id) {
                const { error: uErr } = await supabase
                  .from('plan_exercises').update(dbData).eq('id', ex.id)
                if (uErr) throw uErr
              } else {
                const { error: iErr } = await supabase
                  .from('plan_exercises').insert(dbData)
                if (iErr) throw iErr
              }
            }
          }
        }
      }

      // Limpiar buffers
      setToDeleteBlocks([])
      setToDeleteExercises([])

      if (plan.plan_type === 'evaluation') navigate(`/coach/evaluations/${id}`)
      else navigate(`/coach/plans/${id}`)
    } catch (err) {
      console.error(err)
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
  const currentBlocks = planBlocks[activeSection] || []

  // Numerar "Fuerza 1", "Fuerza 2"
  let strengthCounter = 0
  const strengthIndexMap = currentBlocks.map(b => {
    if (b.block_type !== 'strength') return 0
    const idx = strengthCounter
    strengthCounter += 1
    return idx
  })

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

        {/* Categoría y método de evaluación */}
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
                </button>
              ))}
            </div>
          </div>
        )}
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

              <div
                className={`sm:col-span-2 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  plan.has_activation ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50'
                }`}
                onClick={() => setPlan(p => ({ ...p, has_activation: !p.has_activation }))}
              >
                <input
                  type="checkbox" id="has_activation"
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

      {/* Evaluación plano */}
      {isEval && ['one_rm', 'max_reps'].includes(plan.eval_type) && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Ejercicios a evaluar</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Se mostrarán en el formulario del alumno.
            </p>
          </div>
          <div className="space-y-3">
            {evalExercises.map((ex, i) => (
              <PlanExerciseRow
                key={ex.id || `new-${i}`}
                ex={ex}
                index={i}
                exercises={exercises}
                exerciseTags={exerciseTags}
                tagAssignments={tagAssignments}
                onUpdate={(idx, field, value) =>
                  setEvalExercises(prev => prev.map((e, k) => k === idx ? { ...e, [field]: value } : e))
                }
                onRemove={(idx) => {
                  const target = evalExercises[idx]
                  if (target?.id) setToDeleteExercises(d => [...d, target.id])
                  setEvalExercises(prev => prev.filter((_, k) => k !== idx))
                }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              const newEx = emptyPlanExercise('day_a')
              newEx.order_index = evalExercises.length
              setEvalExercises(prev => [...prev, newEx])
            }}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} />
            Agregar ejercicio
          </button>
        </div>
      )}

      {/* Entrenamiento con bloques */}
      {!isEval && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Bloques del plan</h2>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {dynamicSections.map(s => {
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
                key={block.id || `new-${i}`}
                block={block}
                blockIndexInSection={i}
                strengthIndexInSection={strengthIndexMap[i]}
                onUpdate={patch => updateBlock(activeSection, i, patch)}
                onUpdateExercises={next => updateBlockExercises(activeSection, i, next)}
                onRemove={() => removeBlock(activeSection, i)}
                onMove={dir => moveBlock(activeSection, i, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < currentBlocks.length - 1}
                exercises={exercises}
                exerciseTags={exerciseTags}
                tagAssignments={tagAssignments}
              />
            ))}

            <AddBlockMenu onAdd={type => addBlock(activeSection, type)} />
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
