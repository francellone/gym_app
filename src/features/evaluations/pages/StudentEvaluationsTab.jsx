import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  evalTypeIcon,
  evalTypeLabel,
  evalTypeColor,
  isExerciseBasedEval,
  evalMethodLabel,
  formatExerciseResponseValue,
  exerciseResponseNumericValue,
  groupEvalExercisesByDay,
} from '../helpers'
import { getDynamicSections } from '@/features/plans/helpers'
import {
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Plus,
  MessageSquare,
  Lock,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Check,
  Save,
  BarChart2,
  Link2,
  X,
  AlertTriangle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  groupEvaluationAssignments,
  statusConfig,
  getAssignmentStatus,
  assignTemplateToStudent,
} from '@/features/plans/assignmentHelpers'
import {
  fetchEvalMirrorBodies,
  postEvalCommentNote,
  fetchSingleMirrorBodies,
} from '@/features/notes/api'
import { useAuth } from '@/features/auth/AuthContext'

// ─────────────────────────────────────────────────────────────
// StudentEvaluationsTab
// Props:
//   studentId  - UUID del alumno
//   assignments - plan_assignments del alumno (incluye plan)
//   allPlans    - todos los planes disponibles
//   onRefresh   - callback para recargar datos en el padre
// ─────────────────────────────────────────────────────────────
export default function StudentEvaluationsTab({ studentId, assignments, allPlans, onRefresh }) {
  // Bug 2 doc 32 iteración 2 (2026-05-26 PM): las evals desasignadas
  // (status='archived') deben desaparecer del tab. El SELECT en
  // StudentDetailPage trae todas las asignaciones; filtramos acá.
  // Las completed/replaced se mantienen porque son referencia histórica.
  const visibleAssignments = (assignments || []).filter((a) => a.status !== 'archived')

  // Solo evaluaciones asignadas (incluye históricas — el agrupador las separa).
  const evalAssignments = visibleAssignments.filter((a) => {
    const t = a.plan_type || a.plan?.plan_type
    return t === 'evaluation'
  })

  // Asignaciones de training del alumno (para dropdown de asociación).
  const trainingAssignments = visibleAssignments.filter((a) => {
    const t = a.plan_type || a.plan?.plan_type || 'training'
    return t === 'training'
  })

  // Agrupado: del plan vigente, independientes, históricas.
  const grouped = useMemo(
    () => groupEvaluationAssignments(visibleAssignments),
    [visibleAssignments]
  )

  // Estado para asignar nueva evaluación
  const [assigning, setAssigning] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [linkedAssignmentId, setLinkedAssignmentId] = useState('') // '' = independiente
  const [assignLoading, setAssignLoading] = useState(false)

  // Cuando la coach selecciona una evaluación con parent_plan_id, sugerimos
  // auto-vincularla a la asignación del alumno que matchea. Solo se autosugiere
  // si la asignación matching está vigente (active o paused) — no tiene
  // sentido linkear a un plan ya reemplazado/completado/archivado.
  useEffect(() => {
    if (!selectedPlanId) {
      setLinkedAssignmentId('')
      return
    }
    const evalPlan = allPlans.find((p) => p.id === selectedPlanId)
    if (!evalPlan?.parent_plan_id) {
      setLinkedAssignmentId('')
      return
    }
    const matching = trainingAssignments
      .filter((a) => a.plan_id === evalPlan.parent_plan_id)
      .filter((a) => {
        const s = getAssignmentStatus(a)
        return s === 'active' || s === 'paused'
      })
      .sort((a, b) => {
        const aActive = getAssignmentStatus(a) === 'active'
        const bActive = getAssignmentStatus(b) === 'active'
        if (aActive !== bActive) return aActive ? -1 : 1
        const ta = new Date(a.created_at || 0).getTime()
        const tb = new Date(b.created_at || 0).getTime()
        return tb - ta
      })
    setLinkedAssignmentId(matching[0]?.id || '')
  }, [selectedPlanId, allPlans, trainingAssignments])

  async function handleAssign() {
    if (!selectedPlanId) return
    setAssignLoading(true)
    try {
      // El back rechaza INSERT directo en plan_assignments cuando el
      // plan_id apunta a una plantilla (trg_pa_forbid_template). La RPC
      // clona la plantilla a una instancia personal del alumno y crea
      // el plan_assignment apuntando al clon, de forma atómica.
      await assignTemplateToStudent(supabase, {
        templateId: selectedPlanId,
        studentId,
        startDate: new Date().toISOString().slice(0, 10),
        linkedAssignmentId: linkedAssignmentId || null,
      })
      setAssigning(false)
      setSelectedPlanId('')
      setLinkedAssignmentId('')
      onRefresh()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Error al asignar la evaluación')
    } finally {
      setAssignLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList size={18} className="text-purple-500" />
          Evaluaciones
        </h2>
        <button
          onClick={() => setAssigning(true)}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <Plus size={15} /> Asignar evaluación
        </button>
      </div>

      {/* Panel asignación */}
      {assigning && (
        <AssignEvaluationForm
          allPlans={allPlans}
          trainingAssignments={trainingAssignments}
          selectedPlanId={selectedPlanId}
          onSelectedPlanChange={setSelectedPlanId}
          linkedAssignmentId={linkedAssignmentId}
          onLinkedAssignmentChange={setLinkedAssignmentId}
          loading={assignLoading}
          onCancel={() => {
            setAssigning(false)
            setSelectedPlanId('')
            setLinkedAssignmentId('')
          }}
          onConfirm={handleAssign}
        />
      )}

      {/* Lista vacía global */}
      {evalAssignments.length === 0 && !assigning && (
        <div className="card text-center py-8">
          <ClipboardList size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay evaluaciones asignadas aún.</p>
          <button
            onClick={() => setAssigning(true)}
            className="mt-3 text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Asignar primera evaluación
          </button>
        </div>
      )}

      {/* Sección 1: del plan vigente */}
      {grouped.ofCurrentPlan.length > 0 && (
        <EvalGroup
          title={`Del plan actual: ${grouped.activeTraining?.plan?.title || ''}`}
          accent="purple"
        >
          {grouped.ofCurrentPlan.map((a) => (
            <EvaluationCard
              key={a.id}
              assignment={a}
              studentId={studentId}
              linkedTo={grouped.activeTraining}
              onRefresh={onRefresh}
            />
          ))}
        </EvalGroup>
      )}

      {/* Sección 2: independientes */}
      {grouped.independent.length > 0 && (
        <EvalGroup title="Evaluaciones independientes" accent="gray">
          {grouped.independent.map((a) => (
            <EvaluationCard key={a.id} assignment={a} studentId={studentId} onRefresh={onRefresh} />
          ))}
        </EvalGroup>
      )}

      {/* Sección 3: históricas (planes anteriores) */}
      {grouped.historical.length > 0 && (
        <EvalGroup
          title="De planes anteriores"
          accent="gray"
          subtle
          subtitle="El plan al que estaban vinculadas ya no es el vigente."
        >
          {grouped.historical.map((a) => (
            <EvaluationCard
              key={a.id}
              assignment={a}
              studentId={studentId}
              linkedTo={trainingAssignments.find((t) => t.id === a.linked_assignment_id) || null}
              historical
              onRefresh={onRefresh}
            />
          ))}
        </EvalGroup>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EvalGroup — header con título + lista de cards
// ─────────────────────────────────────────────────────────────
function EvalGroup({ title, subtitle, accent = 'gray', subtle = false, children }) {
  const accentMap = {
    purple: { dot: 'bg-purple-500', text: 'text-purple-700' },
    gray: { dot: 'bg-gray-400', text: subtle ? 'text-gray-400' : 'text-gray-600' },
  }
  const a = accentMap[accent] || accentMap.gray
  return (
    <div className={`space-y-2 ${subtle ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2 px-1">
        <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${a.text}`}>{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-400 px-1">{subtitle}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AssignEvaluationForm — form inline reutilizado
// ─────────────────────────────────────────────────────────────
function AssignEvaluationForm({
  allPlans,
  trainingAssignments,
  selectedPlanId,
  onSelectedPlanChange,
  linkedAssignmentId,
  onLinkedAssignmentChange,
  loading,
  onCancel,
  onConfirm,
}) {
  // Solo plantillas de evaluación se pueden asignar — las instancias
  // clonadas son personales y no deben aparecer en la biblioteca.
  const evalPlanOptions = (allPlans || []).filter(
    (p) => p.plan_type === 'evaluation' && p.is_template !== false
  )
  const selectedEvalPlan = evalPlanOptions.find((p) => p.id === selectedPlanId) || null
  const suggestedFromTemplate = !!selectedEvalPlan?.parent_plan_id

  return (
    <div className="card border-2 border-purple-200 bg-purple-50 space-y-3">
      <p className="text-sm font-semibold text-purple-800">Asignar evaluación al alumno</p>

      <div>
        <label className="label text-xs">Evaluación</label>
        <select
          className="input text-sm"
          value={selectedPlanId}
          onChange={(e) => onSelectedPlanChange(e.target.value)}
        >
          <option value="">— Seleccionar evaluación —</option>
          {evalPlanOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Asociar a plan del alumno (opcional) */}
      {selectedPlanId && (
        <div>
          <label className="label text-xs flex items-center gap-1">
            <Link2 size={12} className="text-purple-500" />
            Asociar a plan del alumno (opcional)
          </label>
          <select
            className="input text-sm"
            value={linkedAssignmentId || ''}
            onChange={(e) => onLinkedAssignmentChange(e.target.value || '')}
          >
            <option value="">Independiente</option>
            {trainingAssignments.map((a) => {
              const status = getAssignmentStatus(a)
              const cfg = statusConfig(status)
              return (
                <option key={a.id} value={a.id}>
                  {a.plan?.title} · {cfg.shortLabel}
                </option>
              )
            })}
          </select>
          {suggestedFromTemplate && linkedAssignmentId && (
            <p className="text-xs text-purple-700 mt-1">
              Sugerido automáticamente: esta evaluación es parte del plan asociado.
            </p>
          )}
          {suggestedFromTemplate && !linkedAssignmentId && (
            <p className="text-xs text-amber-600 mt-1">
              Esta evaluación es parte de un plan, pero el alumno no lo tiene asignado.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1 text-sm">
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={!selectedPlanId || loading}
          className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Check size={14} /> Asignar
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EvaluationCard — tarjeta por evaluación asignada
// ─────────────────────────────────────────────────────────────
function EvaluationCard({
  assignment,
  studentId,
  linkedTo = null,
  historical = false,
  onRefresh = () => {},
}) {
  const plan = assignment.plan
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState('ultimo') // 'ultimo' | 'historial'

  // Bug 2 doc 32: desasignar evaluación. Q4 13.7 (Anto): active=false,
  // mantener evaluation_results parciales. UI: botón ✕ en header (no
  // visible en históricas), confirm modal con resumen del impacto.
  const [showUnassign, setShowUnassign] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const assignmentStatus = getAssignmentStatus(assignment)
  const canUnassign =
    !historical && (assignmentStatus === 'active' || assignmentStatus === 'paused')

  // Datos cargados al expandir
  // doc 41: planExercises = filas de plan_exercises (modelo nuevo, por día).
  const [planExercises, setPlanExercises] = useState([])
  const [resultados, setResultados] = useState([]) // evaluation_results con responses
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // doc 41: evals basadas en ejercicios (one_rm/max_reps/custom/mixed) leen
  // plan_exercises + responses por plan_exercise_id. Los protocolos enteros
  // (power/cardio/body_comp/scored) mantienen el jsonb en results.
  const exerciseBased = isExerciseBasedEval(plan?.eval_type)
  const colorClass = evalTypeColor(plan?.eval_type)
  const tags = plan?.eval_tags || []

  async function handleUnassign() {
    setUnassigning(true)
    try {
      // Q4 13.7 (Anto): mantener resultados parciales, solo archivar la
      // asignación. NO borrar evaluation_results del alumno.
      const { error } = await supabase
        .from('plan_assignments')
        .update({ active: false, status: 'archived' })
        .eq('id', assignment.id)
      if (error) throw error
      setShowUnassign(false)
      onRefresh()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Error al desasignar la evaluación')
    } finally {
      setUnassigning(false)
    }
  }

  async function fetchData() {
    if (loaded || loading) return
    setLoading(true)
    try {
      // doc 41: evals exercise-based → cargar plan_exercises (por día).
      if (exerciseBased) {
        const { data: peData } = await supabase
          .from('plan_exercises')
          .select('*, exercises(name, video_url)')
          .eq('plan_id', plan.id)
          .order('order_index')
        let peRows = peData || []

        // Compat: custom pre-cutover puede vivir todavía en evaluation_tests.
        if (peRows.length === 0 && plan.eval_type === 'custom') {
          const { data: testsData } = await supabase
            .from('evaluation_tests')
            .select('*, exercises(name, video_url)')
            .eq('plan_id', plan.id)
            .order('order_index')
          peRows = (testsData || []).map((t) => ({
            id: t.id, // se keyea por test_id en este caso
            exercise_id: t.exercise_id,
            section: 'day_a',
            order_index: t.order_index || 0,
            eval_type: 'custom',
            eval_method: t.test_type || 'libre',
            instructions: t.instructions,
            expected_value: t.expected_value,
            expected_unit: t.expected_unit,
            mandatory: t.mandatory,
            exercises: t.exercises || { name: t.exercise_name },
            __legacyTest: true,
          }))
        }
        setPlanExercises(peRows)
      }

      // Cargar todos los resultados del alumno para este plan
      const { data: resultsData } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('plan_id', plan.id)
        .eq('student_id', studentId)
        .order('eval_date', { ascending: false })
      const results = resultsData || []

      // Round 2b (handoff m26→m27): la columna evaluation_results.notes se
      // dropeó. La nota general del alumno vive en public.notes con
      // context_type='evaluation_result'. Mergemos el body del mirror
      // sobre `notes` (y `results.notes` para JSX legacy que la usa).
      if (results.length > 0) {
        const resultIds = results.map((r) => r.id)
        const resultMirrors = await fetchSingleMirrorBodies({
          contextType: 'evaluation_result',
          contextIds: resultIds,
        })
        for (const r of results) {
          const panelBody = resultMirrors.get(r.id)
          if (panelBody) {
            r.notes = panelBody
            r.results = { ...(r.results || {}), notes: panelBody }
          }
        }
      }

      // Cargar responses por ejercicio para cada resultado (modelo nuevo).
      if (exerciseBased && results.length > 0) {
        const resultIds = results.map((r) => r.id)
        const { data: responsesData } = await supabase
          .from('evaluation_test_responses')
          .select('*')
          .in('evaluation_result_id', resultIds)

        // Round 2a: merge body de notas mirror eval (context_id=etr.id)
        // sobre cada respuesta. Las 3 columnas legacy se preservan como
        // fallback hasta que se dropeen en round 2b.
        const respIds = (responsesData || []).map((r) => r.id)
        const evalMirrors = await fetchEvalMirrorBodies(respIds)

        const responsesByResult = {}
        for (const r of responsesData || []) {
          const mirror = evalMirrors.get(r.id) || {}
          const enriched = {
            ...r,
            student_comment: mirror.studentComment ?? r.student_comment,
            coach_comment_public: mirror.coachPublic ?? r.coach_comment_public,
            coach_comment_private: mirror.coachPrivate ?? r.coach_comment_private,
          }
          if (!responsesByResult[r.evaluation_result_id]) {
            responsesByResult[r.evaluation_result_id] = []
          }
          responsesByResult[r.evaluation_result_id].push(enriched)
        }
        results.forEach((r) => {
          r._responses = responsesByResult[r.id] || []
        })
      }

      setResultados(results)
      setLoaded(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next) fetchData()
  }

  const latestResult = resultados[0] || null

  // doc 41: las evals one_rm/max_reps completadas ANTES del modelo nuevo
  // (doc 38, 30/05) guardaron en results.exercises jsonb (0 responses) →
  // se siguen mostrando con ResultadosCientificos para no regresionar.
  // La vista nueva por ejercicio aplica a custom/mixed (siempre nuevas) o
  // a cualquier eval que ya tenga responses cargadas (modelo nuevo).
  const hasNewResponses = resultados.some((r) => (r._responses || []).length > 0)
  const showExerciseView =
    exerciseBased && (['custom', 'mixed'].includes(plan?.eval_type) || hasNewResponses)

  return (
    <div className={`card space-y-0 p-0 overflow-hidden ${historical ? 'opacity-80' : ''}`}>
      {/* Header de la tarjeta — div para permitir botón anidado de desasignar */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleToggle()
          }
        }}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="text-2xl">{evalTypeIcon(plan?.eval_type)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{plan?.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`badge text-xs ${colorClass}`}>{evalTypeLabel(plan?.eval_type)}</span>
            {tags.map((t) => (
              <span key={t} className="badge text-xs bg-purple-100 text-purple-700">
                {t}
              </span>
            ))}
            {linkedTo && (
              <span className="badge text-xs bg-blue-50 text-blue-700 border border-blue-100 inline-flex items-center gap-1">
                📎 {linkedTo.plan?.title}
              </span>
            )}
            {latestResult && (
              <span className="text-xs text-gray-400">
                Última:{' '}
                {format(parseISO(latestResult.eval_date + 'T12:00:00'), 'd MMM yyyy', {
                  locale: es,
                })}
              </span>
            )}
            {!latestResult && loaded && (
              <span className="text-xs text-gray-400">Sin registros aún</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {resultados.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {resultados.length} {resultados.length === 1 ? 'registro' : 'registros'}
            </span>
          )}
          {canUnassign && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowUnassign(true)
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Desasignar evaluación"
              aria-label="Desasignar evaluación"
            >
              <X size={16} />
            </button>
          )}
          {expanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>
      </div>

      {showUnassign && (
        <UnassignEvaluationModal
          planTitle={plan?.title}
          resultCount={resultados.length}
          loading={unassigning}
          onCancel={() => setShowUnassign(false)}
          onConfirm={handleUnassign}
        />
      )}

      {/* Contenido expandido */}
      {expanded && (
        <div className="border-t border-gray-100">
          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && showExerciseView && (
            <>
              {/* Sub-navegación */}
              <div className="flex gap-1 bg-gray-50 p-2 border-b border-gray-100">
                <button
                  onClick={() => setView('ultimo')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    view === 'ultimo'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Último registro
                </button>
                <button
                  onClick={() => setView('historial')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    view === 'historial'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Historial y comparativa
                </button>
              </div>

              {view === 'ultimo' && (
                <UltimoRegistro
                  planExercises={planExercises}
                  resultado={latestResult}
                  planId={plan.id}
                  studentId={studentId}
                  onSaved={() => {
                    setLoaded(false)
                    fetchData()
                  }}
                />
              )}

              {view === 'historial' && (
                <HistorialComparativo planExercises={planExercises} resultados={resultados} />
              )}
            </>
          )}

          {/* Protocolos enteros + one_rm/max_reps legacy (jsonb): vista científica */}
          {!loading && !showExerciseView && (
            <ResultadosCientificos resultados={resultados} plan={plan} />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// UltimoRegistro — tabla con último resultado + comentarios coach
// ─────────────────────────────────────────────────────────────
function UltimoRegistro({
  planExercises,
  resultado,
  planId: _planId,
  studentId: _studentId,
  onSaved,
}) {
  // multi-coach v31: necesitamos profile.id como coachId al postear comentarios.
  const { profile } = useAuth()
  // doc 41: map keyado por plan_exercise_id (o test_id en legacy custom).
  const [responses, setResponses] = useState({})
  const [savingComment, setSavingComment] = useState(null) // peId que se está guardando
  const [editingComments, setEditingComments] = useState({}) // peId → { public, private }

  useEffect(() => {
    if (!resultado) {
      setResponses({})
      return
    }
    const map = {}
    const initial = {}
    for (const r of resultado._responses || []) {
      const key = r.plan_exercise_id || r.test_id
      if (!key) continue
      map[key] = r
      initial[key] = {
        public: r.coach_comment_public || '',
        private: r.coach_comment_private || '',
      }
    }
    setResponses(map)
    setEditingComments(initial)
  }, [resultado])

  function getComment(peId) {
    return editingComments[peId] || { public: '', private: '' }
  }

  function updateComment(peId, field, value) {
    setEditingComments((prev) => ({
      ...prev,
      [peId]: { ...(prev[peId] || { public: '', private: '' }), [field]: value },
    }))
  }

  // pe: fila de plan_exercises (o pseudo-fila legacy con __legacyTest).
  async function saveComments(pe) {
    if (!resultado) return
    const peId = pe.id
    setSavingComment(peId)
    try {
      const comment = getComment(peId)
      const existing = responses[peId]
      // Los comentarios viven en el panel; necesitamos un response_id estable.
      // Si no existe la response, la creamos vacía keyada por plan_exercise_id
      // (o test_id para custom legacy).
      let responseId = existing?.id
      if (!responseId) {
        const keyField = pe.__legacyTest ? 'test_id' : 'plan_exercise_id'
        const { data: inserted } = await supabase
          .from('evaluation_test_responses')
          .insert({
            evaluation_result_id: resultado.id,
            [keyField]: peId,
          })
          .select('id')
          .single()
        responseId = inserted?.id
      }

      if (resultado.student_id && responseId) {
        const [pubRes, privRes] = await Promise.all([
          postEvalCommentNote({
            studentId: resultado.student_id,
            responseId,
            body: comment.public || '',
            role: 'coach',
            visibility: 'shared',
            coachId: profile?.id,
          }),
          postEvalCommentNote({
            studentId: resultado.student_id,
            responseId,
            body: comment.private || '',
            role: 'coach',
            visibility: 'coach_private',
            coachId: profile?.id,
          }),
        ])
        if (pubRes.error) console.warn('[saveComments] pub error:', pubRes.error)
        if (privRes.error) console.warn('[saveComments] priv error:', privRes.error)
      }

      onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingComment(null)
    }
  }

  // Agrupar ejercicios por día (section). Header de día solo si hay más de uno.
  const byDay = groupEvalExercisesByDay(planExercises || [])
  const dayKeys = getDynamicSections(7, false)
    .map((s) => s.id)
    .filter((id) => (byDay[id] || []).length > 0)
  const multiDay = dayKeys.length > 1

  // ── Sin registro del alumno: preview de los ejercicios asignados ──
  if (!resultado) {
    if (planExercises && planExercises.length > 0) {
      return (
        <div className="p-4 space-y-3">
          <div className="text-center text-xs text-gray-400 py-2 border-b border-gray-100">
            <ClipboardList size={20} className="mx-auto mb-1 text-gray-300" />
            El alumno todavía no registró esta evaluación.
            <br />
            <span className="text-gray-400">{planExercises.length} ejercicios asignados:</span>
          </div>
          {dayKeys.map((sec) => (
            <div key={sec} className="space-y-1.5">
              {multiDay && (
                <p className="text-xs font-bold text-gray-400 uppercase">
                  Día {sec.replace('day_', '').toUpperCase()}
                </p>
              )}
              {(byDay[sec] || []).map((pe) => (
                <div
                  key={pe.id}
                  className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {pe.exercises?.name || 'Ejercicio sin nombre'}
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        {evalMethodLabel(pe.eval_type || 'custom', pe.eval_method)}
                      </span>
                    </p>
                    {pe.instructions && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{pe.instructions}</p>
                    )}
                    {(pe.expected_value || pe.expected_unit) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Esperado: {pe.expected_value || '—'} {pe.expected_unit || ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="p-4 text-center text-sm text-gray-400 py-8">
        <ClipboardList size={28} className="mx-auto mb-2 text-gray-300" />
        El alumno aún no registró esta evaluación.
      </div>
    )
  }

  const fechaStr = format(parseISO(resultado.eval_date + 'T12:00:00'), "d 'de' MMMM yyyy", {
    locale: es,
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Clock size={13} /> {fechaStr}
        </p>
        {resultado.notes && (
          <span className="text-xs text-gray-400 italic truncate max-w-48">
            "{resultado.notes}"
          </span>
        )}
      </div>

      {(planExercises || []).length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          Esta evaluación no tiene ejercicios definidos.
        </p>
      )}

      {dayKeys.map((sec) => {
        const dayDate = resultado.results?.day_dates?.[sec]
        return (
          <div key={sec} className="space-y-3">
            {multiDay && (
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                Día {sec.replace('day_', '').toUpperCase()}
                {dayDate && (
                  <span className="normal-case font-normal text-gray-400">
                    · {format(parseISO(dayDate + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
                  </span>
                )}
              </p>
            )}
            {(byDay[sec] || []).map((pe) => {
              const resp = responses[pe.id]
              const evalType = pe.eval_type || 'custom'
              const comment = getComment(pe.id)
              const ejercicioNombre = pe.exercises?.name || '—'
              const valueStr = resp?.student_response
                ? formatExerciseResponseValue(evalType, resp.student_response)
                : ''
              const actualNum = resp?.student_response
                ? exerciseResponseNumericValue(evalType, resp.student_response)
                : null

              return (
                <div key={pe.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                  {/* Header ejercicio */}
                  <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{ejercicioNombre}</p>
                      {pe.instructions && (
                        <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap break-words">
                          {pe.instructions}
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {evalMethodLabel(evalType, pe.eval_method)}
                    </span>
                    {pe.mandatory && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                        Oblig.
                      </span>
                    )}
                  </div>

                  {/* Respuesta del alumno */}
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {(pe.expected_value || pe.expected_unit) && (
                        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                          <p className="text-xs text-blue-500 font-medium mb-0.5">Esperado</p>
                          <p className="text-base font-bold text-blue-700">
                            {pe.expected_value ? (
                              <>
                                {pe.expected_value}
                                {pe.expected_unit && (
                                  <span className="text-xs font-normal ml-1">
                                    {pe.expected_unit}
                                  </span>
                                )}
                              </>
                            ) : (
                              pe.expected_unit
                            )}
                          </p>
                        </div>
                      )}
                      <div
                        className={`rounded-xl p-2.5 text-center ${valueStr ? 'bg-green-50' : 'bg-gray-50'}`}
                      >
                        <p
                          className={`text-xs font-medium mb-0.5 ${valueStr ? 'text-green-500' : 'text-gray-400'}`}
                        >
                          Resultado
                        </p>
                        {valueStr ? (
                          <p className="text-base font-bold text-green-700">{valueStr}</p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Sin registro</p>
                        )}
                      </div>
                    </div>

                    {/* Indicador mejoró/igual/bajó (si hay expected numérico) */}
                    {actualNum != null &&
                      pe.expected_value &&
                      !isNaN(parseFloat(pe.expected_value)) && (
                        <ComparisonBadge
                          actual={actualNum}
                          expected={parseFloat(pe.expected_value)}
                          testType={pe.eval_method}
                        />
                      )}

                    {/* Comentario del alumno */}
                    {resp?.student_comment && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <p className="text-xs text-amber-600 font-medium mb-0.5 flex items-center gap-1">
                          <MessageSquare size={11} /> Observación del alumno
                        </p>
                        <p className="text-sm text-amber-800">{resp.student_comment}</p>
                      </div>
                    )}

                    {/* Comentarios del coach */}
                    <CoachCommentEditor
                      testId={pe.id}
                      publicComment={comment.public}
                      privateComment={comment.private}
                      onUpdatePublic={(v) => updateComment(pe.id, 'public', v)}
                      onUpdatePrivate={(v) => updateComment(pe.id, 'private', v)}
                      onSave={() => saveComments(pe)}
                      saving={savingComment === pe.id}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CoachCommentEditor
// ─────────────────────────────────────────────────────────────
function CoachCommentEditor({
  testId: _testId,
  publicComment,
  privateComment,
  onUpdatePublic,
  onUpdatePrivate,
  onSave,
  saving,
}) {
  const [open, setOpen] = useState(false)
  const hasContent = publicComment?.trim() || privateComment?.trim()

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 text-xs font-medium py-1.5 px-2 rounded-lg transition-colors ${
          hasContent
            ? 'text-purple-700 bg-purple-50 hover:bg-purple-100'
            : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <MessageSquare size={13} />
        {hasContent ? 'Ver / editar comentarios del coach' : 'Agregar comentario del coach'}
        {open ? (
          <ChevronUp size={13} className="ml-auto" />
        ) : (
          <ChevronDown size={13} className="ml-auto" />
        )}
      </button>

      {open && (
        <div className="space-y-2 pl-1">
          {/* Comentario público */}
          <div>
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1 mb-1">
              <Eye size={12} className="text-green-500" /> Comentario público (visible al alumno)
            </label>
            <textarea
              className="input text-xs resize-none"
              rows={2}
              placeholder="Retroalimentación que verá el alumno..."
              value={publicComment}
              onChange={(e) => onUpdatePublic(e.target.value)}
            />
          </div>

          {/* Comentario privado */}
          <div>
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1 mb-1">
              <Lock size={12} className="text-gray-500" /> Nota privada (solo vos)
            </label>
            <textarea
              className="input text-xs resize-none"
              rows={2}
              placeholder="Nota interna solo para el coach..."
              value={privateComment}
              onChange={(e) => onUpdatePrivate(e.target.value)}
            />
          </div>

          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary text-xs w-full flex items-center justify-center gap-1.5 py-2"
          >
            {saving ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save size={12} /> Guardar comentarios
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ComparisonBadge — mejoró / igual / bajó
// ─────────────────────────────────────────────────────────────
function ComparisonBadge({ actual, expected, testType }) {
  // Para tiempo: menor es mejor. Para el resto: mayor es mejor.
  const lowerIsBetter = testType === 'tiempo'
  const diff = actual - expected
  const improved = lowerIsBetter ? diff < 0 : diff > 0
  const equal = Math.abs(diff) < 0.01

  if (equal) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full w-fit">
        <Minus size={12} /> Igual al esperado
      </div>
    )
  }
  if (improved) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit">
        <TrendingUp size={12} /> Por encima del esperado
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full w-fit">
      <TrendingDown size={12} /> Por debajo del esperado
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HistorialComparativo
// ─────────────────────────────────────────────────────────────
function HistorialComparativo({ planExercises, resultados }) {
  const [selectedPeId, setSelectedPeId] = useState(planExercises[0]?.id || null)

  if (resultados.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 py-8">
        No hay registros para comparar.
      </div>
    )
  }

  const selectedPe = planExercises.find((p) => p.id === selectedPeId)
  const selectedType = selectedPe?.eval_type || 'custom'

  // Datos históricos para el ejercicio seleccionado (keyado por plan_exercise_id).
  const historico = resultados
    .map((resultado) => {
      const resp = (resultado._responses || []).find(
        (r) => (r.plan_exercise_id || r.test_id) === selectedPeId
      )
      const num = resp?.student_response
        ? exerciseResponseNumericValue(selectedType, resp.student_response)
        : null
      return {
        fecha: resultado.eval_date,
        value: num,
        label: resp?.student_response
          ? formatExerciseResponseValue(selectedType, resp.student_response)
          : '',
        resultadoId: resultado.id,
      }
    })
    .filter((h) => h.value !== null)
    .reverse() // cronológico

  return (
    <div className="p-4 space-y-4">
      {/* Selector de ejercicio */}
      {planExercises.length > 1 && (
        <div>
          <label className="label text-xs">Ver evolución de</label>
          <select
            className="input text-sm"
            value={selectedPeId || ''}
            onChange={(e) => setSelectedPeId(e.target.value)}
          >
            {planExercises.map((p) => (
              <option key={p.id} value={p.id}>
                {p.exercises?.name || 'Ejercicio'} —{' '}
                {evalMethodLabel(p.eval_type || 'custom', p.eval_method)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Timeline de valores */}
      {historico.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Sin datos para este ejercicio.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {selectedPe?.exercises?.name || 'Ejercicio'} — evolución
          </p>
          {historico.map((h, i) => {
            const prev = historico[i - 1]
            const prevVal = prev ? prev.value : null
            const currVal = h.value
            const lowerIsBetter = selectedType === 'custom' && selectedPe?.eval_method === 'tiempo'

            let trend = null
            if (prevVal !== null && !isNaN(currVal) && !isNaN(prevVal)) {
              const diff = currVal - prevVal
              const improved = lowerIsBetter ? diff < 0 : diff > 0
              if (Math.abs(diff) < 0.01) trend = 'equal'
              else if (improved) trend = 'up'
              else trend = 'down'
            }

            return (
              <div
                key={h.resultadoId}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
              >
                <div className="text-xs text-gray-400 w-20 flex-shrink-0">
                  {format(parseISO(h.fecha + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
                </div>
                <div className="flex-1">
                  <span className="text-base font-bold text-gray-900">{h.label}</span>
                </div>
                {trend === 'up' && (
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <TrendingUp size={14} />
                    {!isNaN(prevVal) && <span>+{Math.abs(currVal - prevVal).toFixed(1)}</span>}
                  </div>
                )}
                {trend === 'down' && (
                  <div className="flex items-center gap-1 text-xs text-red-500 font-medium">
                    <TrendingDown size={14} />
                    {!isNaN(prevVal) && <span>−{Math.abs(currVal - prevVal).toFixed(1)}</span>}
                  </div>
                )}
                {trend === 'equal' && <Minus size={14} className="text-gray-400" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla resumen de todos los resultados */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Todos los registros
        </p>
        {resultados.map((resultado) => (
          <div
            key={resultado.id}
            className="flex items-center justify-between p-3 rounded-xl border border-gray-100"
          >
            <span className="text-xs text-gray-600">
              {format(parseISO(resultado.eval_date + 'T12:00:00'), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            </span>
            <span className="text-xs text-gray-400">
              {(resultado._responses || []).length} ejercicios completados
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ResultadosCientificos — vista simple para tipos no-custom
// ─────────────────────────────────────────────────────────────
function ResultadosCientificos({ resultados, plan }) {
  if (resultados.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 py-8">
        <BarChart2 size={28} className="mx-auto mb-2 text-gray-300" />
        El alumno aún no registró esta evaluación.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {resultados.map((r) => (
        <div key={r.id} className="border border-gray-200 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              {format(parseISO(r.eval_date + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
            </span>
          </div>
          {r.notes && <p className="text-xs text-gray-500 italic">"{r.notes}"</p>}
          <ResultadoResumen results={r.results} evalType={plan?.eval_type} />
        </div>
      ))}
    </div>
  )
}

// Resumen compacto de resultados científicos
function ResultadoResumen({ results, evalType }) {
  if (!results) return null

  switch (evalType) {
    case 'one_rm':
      return (
        <div className="space-y-1">
          {(results.exercises || []).map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{ex.name}</span>
              <span className="font-semibold text-gray-900">
                {ex.one_rm ? `${ex.one_rm} kg (1RM)` : `${ex.weight_kg}kg × ${ex.reps}reps`}
              </span>
            </div>
          ))}
        </div>
      )
    case 'cardio':
      return (
        <div className="text-xs">
          {results.vo2max && (
            <span className="font-semibold text-blue-700">VO₂max: {results.vo2max} ml/kg/min</span>
          )}
          {results.distance_m && <span className="ml-2 text-gray-600">{results.distance_m}m</span>}
        </div>
      )
    case 'body_comp':
      return (
        <div className="text-xs">
          {results.result?.fat_pct != null && (
            <span className="font-semibold text-green-700">% Grasa: {results.result.fat_pct}%</span>
          )}
          {results.result?.lean_kg != null && (
            <span className="ml-2 text-gray-600">M. magra: {results.result.lean_kg}kg</span>
          )}
        </div>
      )
    default:
      return (
        <p className="text-xs text-gray-400">
          Datos guardados — ver detalle en la sección de evaluaciones.
        </p>
      )
  }
}

// ─────────────────────────────────────────────────────────────
// UnassignEvaluationModal — confirm modal para Bug 2 doc 32
// Q4 13.7 (Anto): active=false + status='archived'; los
// evaluation_results parciales se conservan (no se borran).
// ─────────────────────────────────────────────────────────────
function UnassignEvaluationModal({ planTitle, resultCount, loading, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Desasignar evaluación</h3>
            <p className="text-sm text-gray-600 mt-1">
              La evaluación <span className="font-medium">{planTitle}</span> quedará archivada para
              el alumno y no la podrá completar.
            </p>
            {resultCount > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {resultCount === 1
                  ? 'El registro ya cargado se conserva'
                  : `Los ${resultCount} registros ya cargados se conservan`}{' '}
                — sólo se archiva la asignación.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary flex-1 text-sm"
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 text-sm py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            type="button"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <X size={14} /> Desasignar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
