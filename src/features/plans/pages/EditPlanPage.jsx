import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft,
  Save,
  AlertCircle,
  Dumbbell,
  BarChart2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Tag,
  X,
} from 'lucide-react'
import PlanExerciseRow from '../components/PlanExerciseRow'
import BlockCard from '../components/blocks/BlockCard'
import AddBlockMenu from '../components/blocks/AddBlockMenu'
import DayBlocksOrderWarning from '../components/blocks/DayBlocksOrderWarning'
import {
  getDynamicSections,
  emptyPlanExercise,
  emptyBlock,
  dbBlockToUI,
  dbExToUIEx,
  uiExToDBEx,
  uiBlockToDB,
  reorderByBlockmate,
} from '../helpers'
import {
  EVAL_TYPES,
  METHODS,
  PRUEBA_TYPES,
  EVAL_TAG_SUGGESTIONS,
} from '@/features/evaluations/helpers'
import EvaluationParentPlanField, {
  EvaluationsLinkedPanel,
} from '../components/EvaluationParentPlanField'

// ============================================================
// EditPruebaRow — fila editable de una prueba (reutiliza lógica de Create)
// ============================================================
function EditPruebaRow({ prueba, index, total, exercises, onUpdate, onRemove, onMove }) {
  const [expanded, setExpanded] = useState(true)
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [newExName, setNewExName] = useState('')

  const selectedExercise = exercises.find((e) => e.id === prueba.exercise_id)

  async function handleCreateExercise() {
    if (!newExName.trim()) return
    try {
      const { data: newEx, error } = await supabase
        .from('exercises')
        .insert({ name: newExName.trim() })
        .select()
        .single()
      if (error) throw error
      onUpdate('exercise_id', newEx.id)
      onUpdate('exercise_name', newEx.name)
      setCreatingExercise(false)
      setNewExName('')
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <GripVertical size={14} className="text-gray-300" />
        <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">
          {selectedExercise?.name || prueba.exercise_name || 'Nueva prueba'}
        </span>
        {prueba.mandatory && (
          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
            Oblig.
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 px-1"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 px-1">
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && (
        <div className="p-3 space-y-3">
          <div>
            <label className="label text-xs">Ejercicio</label>
            {!creatingExercise ? (
              <div className="flex gap-2">
                <select
                  className="input flex-1 text-sm"
                  value={prueba.exercise_id || ''}
                  onChange={(e) => {
                    const ex = exercises.find((x) => x.id === e.target.value)
                    onUpdate('exercise_id', e.target.value)
                    onUpdate('exercise_name', ex?.name || '')
                  }}
                >
                  <option value="">— Seleccionar ejercicio —</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingExercise(true)}
                  className="btn-secondary text-xs px-3 whitespace-nowrap"
                >
                  + Nuevo
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Nombre del ejercicio"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateExercise()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateExercise}
                  className="btn-primary text-xs px-3"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingExercise(false)
                    setNewExName('')
                  }}
                  className="btn-secondary text-xs px-3"
                >
                  ×
                </button>
              </div>
            )}
            {!prueba.exercise_id && !creatingExercise && (
              <input
                className="input text-sm mt-2"
                placeholder="O escribí el nombre libremente..."
                value={prueba.exercise_name || ''}
                onChange={(e) => onUpdate('exercise_name', e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label text-xs">Tipo de prueba</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PRUEBA_TYPES.map((pt) => (
                <button
                  key={pt.key}
                  type="button"
                  onClick={() => {
                    onUpdate('test_type', pt.key)
                    onUpdate('expected_unit', pt.unit || '')
                  }}
                  className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    prueba.test_type === pt.key
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {pt.label}
                  {pt.unit && <span className="ml-1 text-gray-400 font-normal">({pt.unit})</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label text-xs">Instrucciones</label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder="Describí cómo ejecutar la prueba..."
              value={prueba.instructions || ''}
              onChange={(e) => onUpdate('instructions', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Valor esperado (opcional)</label>
              <input
                className="input text-sm"
                placeholder="ej: 10"
                value={prueba.expected_value || ''}
                onChange={(e) => onUpdate('expected_value', e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Unidad</label>
              <input
                className="input text-sm"
                placeholder="ej: reps, kg"
                value={prueba.expected_unit || ''}
                onChange={(e) => onUpdate('expected_unit', e.target.value)}
              />
            </div>
          </div>
          <div
            className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
              prueba.mandatory ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
            }`}
            onClick={() => onUpdate('mandatory', !prueba.mandatory)}
          >
            <input
              type="checkbox"
              readOnly
              checked={prueba.mandatory}
              className="w-4 h-4 pointer-events-none text-red-500"
            />
            <span
              className={`text-xs font-medium ${prueba.mandatory ? 'text-red-700' : 'text-gray-600'}`}
            >
              Prueba obligatoria
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
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
    parent_plan_id: null,
  })

  // { day_a: [block, block], day_b: [block], ... }
  const [planBlocks, setPlanBlocks] = useState({})
  // Evaluaciones: lista plana
  const [evalExercises, setEvalExercises] = useState([])
  const [activeSection, setActiveSection] = useState('day_a')

  // Q7 — banner por día: secciones donde el coach apretó "Dejar como está".
  // Se resetea al desmontar (no persiste entre cargas del editor).
  const [dismissedOrderWarnings, setDismissedOrderWarnings] = useState(() => new Set())

  // IDs para borrar al guardar
  const [toDeleteBlocks, setToDeleteBlocks] = useState([])
  const [toDeleteExercises, setToDeleteExercises] = useState([])

  // Estado para pruebas custom
  const [evalPruebas, setEvalPruebas] = useState([])
  const [evalTags, setEvalTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [toDeletePruebas, setToDeletePruebas] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
      supabase
        .from('plans')
        .select(
          `
          *,
          plan_blocks(*),
          plan_exercises(*, exercise:exercises!exercise_id(*))
        `
        )
        .eq('id', id)
        .single(),
    ])
      .then(async ([exRes, tagsRes, assignRes, planRes]) => {
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
          parent_plan_id: p.parent_plan_id || null,
        }
        setPlan(loadedPlan)
        setEvalTags(p.eval_tags || [])

        if (loadedPlan.plan_type === 'evaluation') {
          if (loadedPlan.eval_type === 'custom') {
            // Cargar pruebas custom
            const { data: pruebasData } = await supabase
              .from('evaluation_tests')
              .select('*')
              .eq('plan_id', id)
              .order('order_index')
            setEvalPruebas(
              (pruebasData || []).map((p) => ({
                id: p.id,
                exercise_id: p.exercise_id || '',
                exercise_name: p.exercise_name || '',
                test_type: p.test_type || 'libre',
                instructions: p.instructions || '',
                expected_value: p.expected_value || '',
                expected_unit: p.expected_unit || '',
                mandatory: p.mandatory || false,
              }))
            )
          } else {
            // Lista plana de ejercicios científicos
            const evals = (p.plan_exercises || [])
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map(dbExToUIEx)
            setEvalExercises(evals)
          }
          setActiveSection('day_a')
        } else {
          // Armar blocks por sección con sus ejercicios anidados
          const sections = getDynamicSections(
            loadedPlan.sessions_per_week,
            loadedPlan.has_activation
          )

          const exsByBlock = {}
          const orphansBySection = {}
          for (const ex of p.plan_exercises || []) {
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
          for (const b of p.plan_blocks || []) {
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
              .map((e) => {
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
      })
      .catch((err) => {
        console.error(err)
        setError(err.message || 'Error al cargar el plan')
      })
      .finally(() => setLoading(false))
  }, [id])

  // Sincronizar secciones cuando cambia sessions_per_week / has_activation
  useEffect(() => {
    if (loading) return
    if (plan.plan_type === 'evaluation') return
    const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
    setPlanBlocks((prev) => {
      const next = {}
      for (const s of sections) next[s.id] = prev[s.id] || []
      // Mover a delete los bloques de secciones que desaparecieron
      for (const k of Object.keys(prev)) {
        if (!sections.find((s) => s.id === k)) {
          for (const b of prev[k] || []) {
            if (b.id) setToDeleteBlocks((prevDel) => [...prevDel, b.id])
            for (const ex of b.exercises || []) {
              if (ex.id) setToDeleteExercises((prevDel) => [...prevDel, ex.id])
            }
          }
        }
      }
      return next
    })
    setActiveSection((prev) => {
      if (sections.find((s) => s.id === prev)) return prev
      return sections[0]?.id || 'day_a'
    })
  }, [plan.sessions_per_week, plan.has_activation, plan.plan_type, loading])

  // ============================================================
  // Manipulación de bloques
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
    const prevBlock = (planBlocks[section] || [])[index]
    if (prevBlock) {
      const prevIds = new Set((prevBlock.exercises || []).map((e) => e.id).filter(Boolean))
      const nextIds = new Set(nextExercises.map((e) => e.id).filter(Boolean))
      const removed = [...prevIds].filter((i) => !nextIds.has(i))
      if (removed.length) setToDeleteExercises((d) => [...d, ...removed])
    }
    updateBlock(section, index, { exercises: nextExercises })
  }

  // Q7 — Reordena los ejercicios de cada bloque strength del día por (letra, número).
  // Los ejercicios sin letra quedan en su slot original (no se mueven).
  function reorderSectionStrength(section) {
    setPlanBlocks((prev) => ({
      ...prev,
      [section]: (prev[section] || []).map((b) =>
        b.block_type === 'strength'
          ? { ...b, exercises: reorderByBlockmate(b.exercises || []) }
          : b
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
    setPlanBlocks((prev) => {
      const block = (prev[section] || [])[index]
      if (block?.id) setToDeleteBlocks((d) => [...d, block.id])
      // Los ejercicios se borran por cascada en DB, pero igual los trackeamos
      // por si quedaron sin block_id en modo virtual.
      for (const ex of block?.exercises || []) {
        if (ex.id && !block?.id) setToDeleteExercises((d) => [...d, ex.id])
      }
      return {
        ...prev,
        [section]: (prev[section] || [])
          .filter((_, i) => i !== index)
          .map((b, i) => ({ ...b, order_index: i })),
      }
    })
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
          eval_tags: plan.plan_type === 'evaluation' ? evalTags : [],
          // parent_plan_id solo aplica a evaluaciones; en training siempre NULL
          // (el trigger en DB también lo valida).
          parent_plan_id: plan.plan_type === 'evaluation' ? plan.parent_plan_id || null : null,
        })
        .eq('id', id)
      if (planError) throw planError

      // 2. Borrar bloques marcados (cascade borra sus exercises también)
      if (toDeleteBlocks.length > 0) {
        const { error: dErr } = await supabase.from('plan_blocks').delete().in('id', toDeleteBlocks)
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
        if (plan.eval_type === 'custom') {
          // Pruebas custom: borrar eliminadas, upsert restantes
          if (toDeletePruebas.length > 0) {
            await supabase.from('evaluation_tests').delete().in('id', toDeletePruebas)
          }
          for (let i = 0; i < evalPruebas.length; i++) {
            const p = evalPruebas[i]
            const row = {
              plan_id: id,
              exercise_id: p.exercise_id || null,
              exercise_name: p.exercise_name || null,
              test_type: p.test_type || 'libre',
              instructions: p.instructions || null,
              expected_value: p.expected_value || null,
              expected_unit: p.expected_unit || null,
              mandatory: p.mandatory || false,
              order_index: i,
            }
            if (p.id) {
              const { error: uErr } = await supabase
                .from('evaluation_tests')
                .update(row)
                .eq('id', p.id)
              if (uErr) throw uErr
            } else {
              const { error: iErr } = await supabase.from('evaluation_tests').insert(row)
              if (iErr) throw iErr
            }
          }
          setToDeletePruebas([])
        } else {
          // Evaluaciones científicas: upsert plano
          for (let i = 0; i < evalExercises.length; i++) {
            const ex = evalExercises[i]
            if (!ex.exercise_id) continue
            const dbData = uiExToDBEx(ex, id, 'day_a', i, null)
            if (ex.id) {
              const { error: uErr } = await supabase
                .from('plan_exercises')
                .update(dbData)
                .eq('id', ex.id)
              if (uErr) throw uErr
            } else {
              const { error: iErr } = await supabase.from('plan_exercises').insert(dbData)
              if (iErr) throw iErr
            }
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
            const exs = (block.exercises || []).filter((ex) => ex.exercise_id)
            for (let i = 0; i < exs.length; i++) {
              const ex = exs[i]
              const dbData = uiExToDBEx(ex, id, s.id, i, blockId)
              if (ex.id) {
                const { error: uErr } = await supabase
                  .from('plan_exercises')
                  .update(dbData)
                  .eq('id', ex.id)
                if (uErr) throw uErr
              } else {
                const { error: iErr } = await supabase.from('plan_exercises').insert(dbData)
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

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  const isEval = plan.plan_type === 'evaluation'
  const dynamicSections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
  const currentBlocks = planBlocks[activeSection] || []

  // Numerar "Fuerza 1", "Fuerza 2"
  let strengthCounter = 0
  const strengthIndexMap = currentBlocks.map((b) => {
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

        {/* Categoría y método de evaluación */}
        {isEval && (
          <div>
            <label className="label">Categoría de evaluación</label>
            <div className="grid grid-cols-1 gap-1.5">
              {EVAL_TYPES.map((et) => (
                <button
                  key={et.key}
                  type="button"
                  onClick={() => setPlan((p) => ({ ...p, eval_type: et.key, eval_method: '' }))}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
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
            <div className="sm:col-span-2">
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
                      onClick={() => setEvalTags((prev) => prev.filter((x) => x !== t))}
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
                      const t = tagInput.trim()
                      if (t && !evalTags.includes(t)) setEvalTags((prev) => [...prev, t])
                      setTagInput('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary text-sm px-3"
                  onClick={() => {
                    const t = tagInput.trim()
                    if (t && !evalTags.includes(t)) setEvalTags((prev) => [...prev, t])
                    setTagInput('')
                  }}
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
                      onClick={() => setEvalTags((prev) => [...prev, s])}
                      className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-full transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Plan padre (solo evaluaciones) */}
          {isEval && (
            <div className="sm:col-span-2">
              <EvaluationParentPlanField
                value={plan.parent_plan_id}
                onChange={(v) => setPlan((p) => ({ ...p, parent_plan_id: v }))}
                excludeId={id}
              />
            </div>
          )}

          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              id="is_template"
              className="w-4 h-4 rounded text-primary-600"
              checked={plan.is_template}
              onChange={(e) => setPlan((p) => ({ ...p, is_template: e.target.checked }))}
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
                  setEvalExercises((prev) =>
                    prev.map((e, k) => (k === idx ? { ...e, [field]: value } : e))
                  )
                }
                onRemove={(idx) => {
                  const target = evalExercises[idx]
                  if (target?.id) setToDeleteExercises((d) => [...d, target.id])
                  setEvalExercises((prev) => prev.filter((_, k) => k !== idx))
                }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              const newEx = emptyPlanExercise('day_a')
              newEx.order_index = evalExercises.length
              setEvalExercises((prev) => [...prev, newEx])
            }}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} />
            Agregar ejercicio
          </button>
        </div>
      )}

      {/* Evaluación custom: constructor de pruebas */}
      {isEval && plan.eval_type === 'custom' && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Pruebas de la evaluación</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Editá, reordenás o eliminás pruebas existentes.
            </p>
          </div>
          {evalPruebas.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">Aún no hay pruebas.</p>
          )}
          <div className="space-y-3">
            {evalPruebas.map((prueba, i) => (
              <EditPruebaRow
                key={prueba.id || `new-${i}`}
                prueba={prueba}
                index={i}
                total={evalPruebas.length}
                exercises={exercises}
                onUpdate={(field, value) =>
                  setEvalPruebas((prev) =>
                    prev.map((p, k) => (k === i ? { ...p, [field]: value } : p))
                  )
                }
                onRemove={() => {
                  if (prueba.id) setToDeletePruebas((d) => [...d, prueba.id])
                  setEvalPruebas((prev) => prev.filter((_, k) => k !== i))
                }}
                onMove={(dir) => {
                  const j = i + dir
                  setEvalPruebas((prev) => {
                    if (j < 0 || j >= prev.length) return prev
                    const next = [...prev]
                    ;[next[i], next[j]] = [next[j], next[i]]
                    return next
                  })
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setEvalPruebas((prev) => [
                ...prev,
                {
                  exercise_id: '',
                  exercise_name: '',
                  test_type: 'libre',
                  instructions: '',
                  expected_value: '',
                  expected_unit: '',
                  mandatory: false,
                },
              ])
            }
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} /> Agregar prueba
          </button>
        </div>
      )}

      {/* Entrenamiento con bloques */}
      {!isEval && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Bloques del plan</h2>

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
                key={block.id || `new-${i}`}
                block={block}
                blockIndexInSection={i}
                strengthIndexInSection={strengthIndexMap[i]}
                onUpdate={(patch) => updateBlock(activeSection, i, patch)}
                onUpdateExercises={(next) => updateBlockExercises(activeSection, i, next)}
                onRemove={() => removeBlock(activeSection, i)}
                onMove={(dir) => moveBlock(activeSection, i, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < currentBlocks.length - 1}
                exercises={exercises}
                exerciseTags={exerciseTags}
                tagAssignments={tagAssignments}
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

      {/* Panel: evaluaciones asociadas a este plan (solo training) */}
      {!isEval && <EvaluationsLinkedPanel planId={id} />}

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
          disabled={saving}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save size={16} /> Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  )
}
