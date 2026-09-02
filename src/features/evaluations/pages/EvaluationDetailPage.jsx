import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  EVAL_TYPES,
  METHODS,
  evalTypeColor,
  evalTypeLabel,
  evalTypeIcon,
  isExerciseBasedEval,
  pruebaTypeInfo,
} from '../helpers'
import {
  ArrowLeft,
  Users,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Trash2,
  UserPlus,
} from 'lucide-react'
import DeletePlanModal from '@/features/plans/components/DeletePlanModal'
import AssignEvalToStudentModal from '../components/AssignEvalToStudentModal'
import { fetchSingleMirrorBodies } from '@/features/notes/api'

// ============================================================
// Shared mini components
// ============================================================
function Stat({ label, value, unit, colorClass = 'bg-gray-50' }) {
  if (!value && value !== 0) return null
  return (
    <div className={`${colorClass} rounded-xl p-3 text-center`}>
      <p className="text-lg font-bold text-gray-900">
        {value}
        {unit && <span className="text-xs font-normal text-gray-500 ml-1">{unit}</span>}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function MethodBadge({ method, evalType }) {
  if (!method) return null
  const m = (METHODS[evalType] || []).find((m) => m.key === method)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
      {m?.label || method}
    </span>
  )
}

// ============================================================
// Result viewers per eval_type
// ============================================================

function OneRMView({ results }) {
  if (!results?.exercises?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-3">
      <MethodBadge method={results.method} evalType="one_rm" />
      {results.exercises.map((ex, i) => (
        <div key={i} className="flex flex-col gap-1 bg-gray-50 rounded-xl p-3">
          <p className="text-sm font-semibold text-gray-800">{ex.name || `Ejercicio ${i + 1}`}</p>
          <div className="flex flex-wrap gap-2">
            {ex.weight_kg && (
              <span className="badge bg-gray-100 text-gray-600">{ex.weight_kg} kg</span>
            )}
            {ex.reps && <span className="badge bg-gray-100 text-gray-600">× {ex.reps} reps</span>}
            {ex.one_rm && (
              <span className="badge bg-red-100 text-red-700 font-bold">1RM: {ex.one_rm} kg</span>
            )}
          </div>
        </div>
      ))}
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

function MaxRepsView({ results }) {
  if (!results?.reps) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="max_reps" />
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="badge bg-orange-100 text-orange-700 font-bold text-sm">
          {results.reps} reps
        </span>
        {results.weight_kg && (
          <span className="badge bg-gray-100 text-gray-600">{results.weight_kg} kg</span>
        )}
        {results.volume && (
          <span className="badge bg-orange-50 text-orange-600">Vol: {results.volume} kg</span>
        )}
      </div>
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

function PowerView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="power" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        {results.mass_kg && <Stat label="Masa corporal" value={results.mass_kg} unit="kg" />}
        {results.jump_cm && (
          <Stat
            label="Altura de salto"
            value={results.jump_cm}
            unit="cm"
            colorClass="bg-yellow-50"
          />
        )}
        {results.distance_m && (
          <Stat label="Distancia" value={results.distance_m} unit="m" colorClass="bg-yellow-50" />
        )}
        {results.time_sec && (
          <Stat label="Tiempo" value={results.time_sec} unit="seg" colorClass="bg-yellow-50" />
        )}
      </div>
      {/* Rendered result stored in results.result */}
      {results.result && (
        <div className="space-y-1">
          {results.result.power_w !== undefined && (
            <div className="bg-yellow-100 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-yellow-800">{results.result.power_w} W</p>
              <p className="text-xs text-yellow-600">Potencia media</p>
            </div>
          )}
          {results.result.peak_w !== undefined && (
            <div className="bg-yellow-100 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-yellow-800">{results.result.peak_w} W</p>
              <p className="text-xs text-yellow-600">
                Potencia pico · Media: {results.result.mean_w} W
              </p>
            </div>
          )}
          {results.result.time_sec !== undefined && (
            <div className="bg-yellow-100 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-yellow-800">{results.result.time_sec} seg</p>
              <p className="text-xs text-yellow-600">Velocidad: {results.result.speed_ms} m/s</p>
            </div>
          )}
        </div>
      )}
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

function CardioView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="cardio" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        {results.distance_m && <Stat label="Distancia" value={results.distance_m} unit="m" />}
        {results.time_min && <Stat label="Tiempo" value={results.time_min} unit="min" />}
        {results.heart_rate && <Stat label="FC final" value={results.heart_rate} unit="bpm" />}
        {results.vo2max && (
          <Stat label="VO₂max" value={results.vo2max} unit="ml/kg/min" colorClass="bg-blue-50" />
        )}
        {results.method === 'harvard' && results.vo2max && (
          <Stat label="PFI" value={results.vo2max} unit="pts" colorClass="bg-blue-50" />
        )}
      </div>
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

function BodyCompView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  const r = results.result
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="body_comp" />
      {results.weight_kg && <Stat label="Peso corporal" value={results.weight_kg} unit="kg" />}
      {r && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-700">{r.fat_pct}%</p>
            <p className="text-xs text-green-600">Grasa corporal</p>
          </div>
          {r.fat_kg && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-700">{r.fat_kg} kg</p>
              <p className="text-xs text-gray-500">Masa grasa</p>
            </div>
          )}
          {r.lean_kg && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-700">{r.lean_kg} kg</p>
              <p className="text-xs text-gray-500">Masa magra</p>
            </div>
          )}
        </div>
      )}
      {r?.sum_mm && <p className="text-xs text-gray-400 text-center">Σ pliegues: {r.sum_mm} mm</p>}
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

const SCORE_COLORS_TEXT = ['text-red-600', 'text-orange-500', 'text-yellow-500', 'text-green-600']
const SCORE_BG = ['bg-red-50', 'bg-orange-50', 'bg-yellow-50', 'bg-green-50']

function ScoredView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  const method = results.method || 'fms'

  return (
    <div className="space-y-2">
      <MethodBadge method={method} evalType="scored" />

      {method === 'fms' && results.fms_patterns && (
        <div className="space-y-1.5 mt-2">
          {results.fms_patterns.map((p, _i) => {
            if (p.pain) {
              return (
                <div key={p.key} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-700">{p.label}</span>
                  <span className="badge bg-red-100 text-red-600">⚠️ Dolor</span>
                </div>
              )
            }
            const sc = p.bilateral
              ? Math.min(p.score_left ?? 3, p.score_right ?? 3)
              : (p.score ?? 3)
            if (sc === null || sc === undefined) return null
            const hasAsymmetry = p.bilateral && p.score_left !== p.score_right
            return (
              <div key={p.key} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-gray-700">{p.label}</span>
                {p.bilateral && (
                  <span className="text-xs text-gray-400">
                    I:{p.score_left ?? '?'} D:{p.score_right ?? '?'}
                  </span>
                )}
                <span className={`badge font-bold ${SCORE_BG[sc]} ${SCORE_COLORS_TEXT[sc]}`}>
                  {sc}
                </span>
                {hasAsymmetry && <span className="text-xs text-orange-500">⚡ asimetría</span>}
              </div>
            )
          })}

          {results.result && (
            <div
              className={`mt-3 rounded-xl p-3 text-center ${results.result.total >= 14 ? 'bg-green-50' : 'bg-red-50'}`}
            >
              <p
                className={`text-2xl font-bold ${results.result.total >= 14 ? 'text-green-700' : 'text-red-600'}`}
              >
                {results.result.total} <span className="text-sm font-normal">/ 21</span>
              </p>
              <p
                className={`text-xs mt-0.5 ${results.result.total >= 14 ? 'text-green-600' : 'text-red-500'}`}
              >
                {results.result.total < 14 ? '⚠️ Riesgo de lesión (< 14)' : '✅ Score aceptable'}
              </p>
            </div>
          )}
        </div>
      )}

      {method === 'sit_reach' && results.distance_left_cm && (
        <div className="bg-purple-50 rounded-xl p-3 text-center mt-2">
          <p className="text-xl font-bold text-purple-700">{results.distance_left_cm} cm</p>
          <p className="text-xs text-purple-500">Flexibilidad isquiosural</p>
        </div>
      )}

      {method === 'shoulder_mob' && results.distance_left_cm && results.distance_right_cm && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Stat
            label="Mano D arriba"
            value={results.distance_left_cm}
            unit="cm"
            colorClass="bg-purple-50"
          />
          <Stat
            label="Mano I arriba"
            value={results.distance_right_cm}
            unit="cm"
            colorClass="bg-purple-50"
          />
        </div>
      )}

      {method === 'y_balance' && (
        <div className="space-y-2 mt-2 text-xs">
          {[
            ['reach_anterior', 'Anterior'],
            ['reach_posteromedial', 'Posteromedial'],
            ['reach_posterolateral', 'Posterolateral'],
          ].map(
            ([field, label]) =>
              (results[`${field}_l`] || results[`${field}_r`]) && (
                <div key={field} className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">{label}</span>
                  {results[`${field}_l`] && (
                    <span className="badge bg-purple-50 text-purple-600">
                      I: {results[`${field}_l`]} cm
                    </span>
                  )}
                  {results[`${field}_r`] && (
                    <span className="badge bg-purple-50 text-purple-600">
                      D: {results[`${field}_r`]} cm
                    </span>
                  )}
                </div>
              )
          )}
        </div>
      )}

      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

function CustomView({ results }) {
  if (!results?.fields?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-1.5">
      {results.fields
        .filter((f) => f.label || f.value)
        .map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 flex-1">{f.label || `Campo ${i + 1}`}</span>
            <span className="font-semibold text-gray-900">
              {f.value}
              {f.unit ? ` ${f.unit}` : ''}
            </span>
          </div>
        ))}
      {results.notes && (
        <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>
      )}
    </div>
  )
}

// ============================================================
// Vista de resultados exercise-based (doc 38): una fila por ejercicio,
// agrupada por día. Lee de res._exResponses (response jsonb + plan_exercise).
// ============================================================
function ExerciseBasedView({ result }) {
  const responses = result._exResponses || []
  if (responses.length === 0) return <p className="text-sm text-gray-400">Sin datos</p>

  // Agrupar por día (section del plan_exercise).
  const byDay = {}
  for (const r of responses) {
    const sec = r.plan_exercise?.section || 'day_a'
    if (!byDay[sec]) byDay[sec] = []
    byDay[sec].push(r)
  }
  const dayKeys = Object.keys(byDay).sort()
  const multiDay = dayKeys.length > 1
  const dayDates = result.results?.day_dates || {}

  return (
    <div className="space-y-3">
      {dayKeys.map((sec) => (
        <div key={sec} className="space-y-1.5">
          {multiDay && (
            <p className="text-xs font-bold text-gray-400 uppercase">
              Día {sec.replace('day_', '').toUpperCase()}
              {dayDates[sec] && (
                <span className="ml-1.5 normal-case font-normal text-gray-400">
                  ·{' '}
                  {new Date(dayDates[sec] + 'T12:00:00').toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </p>
          )}
          {byDay[sec]
            .sort(
              (a, b) => (a.plan_exercise?.order_index ?? 0) - (b.plan_exercise?.order_index ?? 0)
            )
            .map((r) => (
              <ExerciseResponseRow key={r.id} resp={r} />
            ))}
        </div>
      ))}
    </div>
  )
}

function ExerciseResponseRow({ resp }) {
  const pe = resp.plan_exercise || {}
  const evalType = pe.eval_type || 'custom'
  const name = pe.exercises?.name || pe.exercise?.name || 'Ejercicio'
  const sr = resp.student_response || {}

  let valueLabel = ''
  if (evalType === 'one_rm') {
    const parts = []
    if (sr.weight_kg) parts.push(`${sr.weight_kg} kg`)
    if (sr.reps) parts.push(`× ${sr.reps}`)
    if (sr.one_rm_estimated) parts.push(`1RM ${sr.one_rm_estimated} kg`)
    valueLabel = parts.join(' · ')
  } else if (evalType === 'max_reps') {
    valueLabel = sr.reps ? `${sr.reps} reps` : ''
  } else {
    valueLabel = [sr.value, sr.unit].filter(Boolean).join(' ')
  }

  const methodLabel =
    evalType === 'custom'
      ? pruebaTypeInfo(pe.eval_method).label
      : (METHODS[evalType] || []).find((m) => m.key === pe.eval_method)?.label || ''

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 break-words">{name}</p>
        {methodLabel && <p className="text-xs text-gray-400">{methodLabel}</p>}
      </div>
      <span className="text-sm font-semibold text-gray-900">{valueLabel || '—'}</span>
    </div>
  )
}

function ResultViewer({ evalType, results }) {
  switch (evalType) {
    case 'one_rm':
      return <OneRMView results={results} />
    case 'max_reps':
      return <MaxRepsView results={results} />
    case 'power':
      return <PowerView results={results} />
    case 'cardio':
      return <CardioView results={results} />
    case 'body_comp':
      return <BodyCompView results={results} />
    case 'scored':
      return <ScoredView results={results} />
    case 'custom':
      return <CustomView results={results} />
    default:
      return (
        <pre className="text-xs text-gray-500 overflow-auto">
          {JSON.stringify(results, null, 2)}
        </pre>
      )
  }
}

// ============================================================
// Student result card
// ============================================================
function StudentResultCard({ assignment, allResults, evalType }) {
  const [expanded, setExpanded] = useState(false)
  const studentResults = allResults
    .filter((r) => r.student_id === assignment.student_id)
    .sort((a, b) => new Date(b.eval_date) - new Date(a.eval_date))
  const latest = studentResults[0]

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => studentResults.length > 0 && setExpanded(!expanded)}
      >
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-primary-700 font-semibold text-sm">
            {assignment.student?.name?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{assignment.student?.name}</p>
          <p className="text-xs text-gray-500">
            {studentResults.length > 0
              ? `${studentResults.length} evaluación${studentResults.length > 1 ? 'es' : ''} · última: ${new Date(latest.eval_date).toLocaleDateString('es-AR')}`
              : 'Sin evaluaciones registradas'}
          </p>
        </div>
        <Link
          to={`/coach/students/${assignment.student_id}`}
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 text-gray-400 hover:text-gray-600"
        >
          <ExternalLink size={14} />
        </Link>
        {studentResults.length > 0 &&
          (expanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          ))}
      </button>

      {expanded && studentResults.length > 0 && (
        <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-5">
          {studentResults.map((res) => (
            <div key={res.id}>
              <p className="text-xs font-semibold text-gray-400 mb-2">
                📅{' '}
                {new Date(res.eval_date).toLocaleDateString('es-AR', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              {isExerciseBasedEval(evalType) ? (
                <ExerciseBasedView result={res} />
              ) : (
                <ResultViewer evalType={evalType} results={res.results} />
              )}
              {res.notes && (
                <p className="text-xs text-gray-500 italic mt-2 border-t pt-2">💬 {res.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main page
// ============================================================
export default function EvaluationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  // Iteración 2 doc 32 (2026-05-26 PM) + Q9 backlog: asignar desde
  // el detalle de la evaluación, igual que desde EvaluationsPage.
  const [showAssignModal, setShowAssignModal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    try {
      // B6 (30/05): los plan_assignments y evaluation_results se guardan SIEMPRE
      // contra el CLON del alumno (is_template=false), no contra el template.
      // Cuando el coach abre el template desde la biblioteca, hay que agregar los
      // datos de todos sus clones (cloned_from_plan_id = template.id); de lo
      // contrario la query del template devuelve 0 filas y no se ve ningún
      // resultado. Si se abre un clon/eval standalone directamente, planIds queda
      // = [id] y el comportamiento es el de antes.
      const { data: cloneRows } = await supabase
        .from('plans')
        .select('id')
        .eq('cloned_from_plan_id', id)
      const planIds = [id, ...(cloneRows || []).map((c) => c.id)]

      const [planRes, assignmentsRes, resultsRes] = await Promise.all([
        supabase.from('plans').select('*').eq('id', id).single(),
        // Sin filtro de active: al completar una eval el trigger pone la
        // asignación en status 'completed'/'archived' (active=false). Si
        // filtráramos active=true no veríamos al alumno que justamente la
        // completó. El filtrado fino se hace abajo (active O con resultado).
        supabase
          .from('plan_assignments')
          .select('*, student:profiles!student_id(id, name)')
          .in('plan_id', planIds),
        supabase
          .from('evaluation_results')
          .select('*')
          .in('plan_id', planIds)
          .order('eval_date', { ascending: false }),
      ])
      setPlan(planRes.data)

      const rawResults = resultsRes.data || []
      // Alumnos a mostrar = los que tienen asignación activa O los que ya
      // cargaron un resultado (su asignación queda completed/archived al
      // completar la eval). Deduplicamos por alumno —un alumno puede tener
      // varios clones del mismo template— mostrando una sola card; cada
      // StudentResultCard ya agrega todos sus resultados por student_id.
      const studentsWithResults = new Set(rawResults.map((r) => r.student_id))
      const byStudent = new Map()
      for (const a of assignmentsRes.data || []) {
        if (!a.active && !studentsWithResults.has(a.student_id)) continue
        if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, a)
      }
      setAssignments([...byStudent.values()])

      // v26f: la columna evaluation_results.notes fue dropeada. Las
      // observaciones generales viven en el panel con context_type=
      // 'evaluation_result'. Si hay mirror, override results.notes (jsonb)
      // y agregamos res.notes (que ya no existe en DB) para que los
      // viewers legacy que leen `results.notes` muestren la versión
      // del panel.
      const resultIds = rawResults.map((r) => r.id)
      const panelBodies = await fetchSingleMirrorBodies({
        contextType: 'evaluation_result',
        contextIds: resultIds,
      })
      const resultsWithPanel = rawResults.map((r) => {
        const panelBody = panelBodies.get(r.id)
        if (panelBody == null) return r
        return {
          ...r,
          notes: panelBody, // legacy fallback en JSX `{res.notes && ...}`
          results: { ...(r.results || {}), notes: panelBody },
        }
      })

      // Doc 38: para evals exercise-based, cargar las responses por ejercicio
      // (join plan_exercises) y adosarlas a cada resultado. Compat: respuestas
      // viejas keyean por test_id (sin plan_exercise_id) → su plan_exercise
      // queda null y caen al render legacy de CustomView vía results jsonb.
      if (isExerciseBasedEval(planRes.data?.eval_type) && resultsWithPanel.length > 0) {
        const resultIds = resultsWithPanel.map((r) => r.id)
        const { data: respData } = await supabase
          .from('evaluation_test_responses')
          .select(
            '*, plan_exercise:plan_exercises!plan_exercise_id(*, exercises!exercise_id(name, video_url))'
          )
          .in('evaluation_result_id', resultIds)
        const byResult = {}
        for (const r of respData || []) {
          if (!byResult[r.evaluation_result_id]) byResult[r.evaluation_result_id] = []
          byResult[r.evaluation_result_id].push(r)
        }
        for (const res of resultsWithPanel) {
          res._exResponses = byResult[res.id] || []
        }
      }

      setResults(resultsWithPanel)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeletePlan(planId) {
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) throw error
    navigate('/coach/evaluations')
  }

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  if (!plan) return <div className="text-center py-12 text-gray-500">Evaluación no encontrada</div>

  const typeInfo = EVAL_TYPES.find((e) => e.key === plan.eval_type)

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 break-words">{plan.title}</h1>
            {plan.eval_type && (
              <span className={`badge ${evalTypeColor(plan.eval_type)}`}>
                {evalTypeIcon(plan.eval_type)} {evalTypeLabel(plan.eval_type)}
              </span>
            )}
          </div>
          {plan.description && <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {plan.is_template !== false && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
              title="Asignar a alumno"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Asignar</span>
            </button>
          )}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn-ghost p-2 text-gray-400 hover:text-red-500"
            title="Eliminar evaluación"
          >
            <Trash2 size={16} />
          </button>
          <Link
            to={`/coach/plans/${id}/edit`}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Edit2 size={14} />
            Editar
          </Link>
        </div>
      </div>

      {showAssignModal && (
        <AssignEvalToStudentModal
          plan={plan}
          onClose={() => setShowAssignModal(false)}
          onDone={() => {
            setShowAssignModal(false)
            fetchData()
          }}
        />
      )}

      {showDeleteModal && (
        <DeletePlanModal
          plan={plan}
          activeStudents={assignments.length}
          resultCount={results.length}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeletePlan}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">{assignments.length}</p>
          <p className="text-xs text-gray-500">Alumnos</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">{results.length}</p>
          <p className="text-xs text-gray-500">Evaluaciones</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-gray-900">
            {results.length > 0
              ? new Date(results[0]?.eval_date).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                })
              : '—'}
          </p>
          <p className="text-xs text-gray-500">Última</p>
        </div>
      </div>

      {/* Type info */}
      {typeInfo && (
        <div className="card">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{typeInfo.icon}</span>
            <div>
              <p className="font-semibold text-gray-900">{typeInfo.label}</p>
              <p className="text-sm text-gray-500">{typeInfo.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(METHODS[plan.eval_type] || []).map((m) => (
                  <span
                    key={m.key}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Students & Results */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm text-gray-900">Resultados por alumno</h3>
        </div>

        {assignments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No hay alumnos asignados a esta evaluación.
            <br />
            <Link to="/coach/students" className="text-primary-600 underline mt-1 inline-block">
              Ir a alumnos
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <StudentResultCard
                key={a.id}
                assignment={a}
                allResults={results}
                evalType={plan.eval_type}
              />
            ))}
          </div>
        )}
      </div>

      {assignments.length > 0 && results.length === 0 && (
        <div className="card text-center py-6">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Los alumnos aún no han registrado evaluaciones</p>
        </div>
      )}
    </div>
  )
}
