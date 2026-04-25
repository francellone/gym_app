import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EVAL_TYPES, METHODS, evalTypeColor, evalTypeLabel, evalTypeIcon } from '../../utils/evalHelpers'
import { ArrowLeft, Users, Calendar, ChevronDown, ChevronUp, Edit2, ExternalLink, Trash2 } from 'lucide-react'
import DeletePlanModal from '../../components/DeletePlanModal'

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
  const m = (METHODS[evalType] || []).find(m => m.key === method)
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
  const hasResults = results.exercises.some(ex => ex.one_rm)
  return (
    <div className="space-y-3">
      <MethodBadge method={results.method} evalType="one_rm" />
      {results.exercises.map((ex, i) => (
        <div key={i} className="flex flex-col gap-1 bg-gray-50 rounded-xl p-3">
          <p className="text-sm font-semibold text-gray-800">{ex.name || `Ejercicio ${i + 1}`}</p>
          <div className="flex flex-wrap gap-2">
            {ex.weight_kg && <span className="badge bg-gray-100 text-gray-600">{ex.weight_kg} kg</span>}
            {ex.reps && <span className="badge bg-gray-100 text-gray-600">× {ex.reps} reps</span>}
            {ex.one_rm && <span className="badge bg-red-100 text-red-700 font-bold">1RM: {ex.one_rm} kg</span>}
          </div>
        </div>
      ))}
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function MaxRepsView({ results }) {
  if (!results?.reps) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="max_reps" />
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="badge bg-orange-100 text-orange-700 font-bold text-sm">{results.reps} reps</span>
        {results.weight_kg && <span className="badge bg-gray-100 text-gray-600">{results.weight_kg} kg</span>}
        {results.volume && <span className="badge bg-orange-50 text-orange-600">Vol: {results.volume} kg</span>}
      </div>
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
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
        {results.jump_cm && <Stat label="Altura de salto" value={results.jump_cm} unit="cm" colorClass="bg-yellow-50" />}
        {results.distance_m && <Stat label="Distancia" value={results.distance_m} unit="m" colorClass="bg-yellow-50" />}
        {results.time_sec && <Stat label="Tiempo" value={results.time_sec} unit="seg" colorClass="bg-yellow-50" />}
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
              <p className="text-xs text-yellow-600">Potencia pico · Media: {results.result.mean_w} W</p>
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
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
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
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function BodyCompView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  const r = results.result
  return (
    <div className="space-y-2">
      <MethodBadge method={results.method} evalType="body_comp" />
      {results.weight_kg && (
        <Stat label="Peso corporal" value={results.weight_kg} unit="kg" />
      )}
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
      {r?.sum_mm && (
        <p className="text-xs text-gray-400 text-center">Σ pliegues: {r.sum_mm} mm</p>
      )}
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
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
          {results.fms_patterns.map((p, i) => {
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
                  <span className="text-xs text-gray-400">I:{p.score_left ?? '?'} D:{p.score_right ?? '?'}</span>
                )}
                <span className={`badge font-bold ${SCORE_BG[sc]} ${SCORE_COLORS_TEXT[sc]}`}>{sc}</span>
                {hasAsymmetry && <span className="text-xs text-orange-500">⚡ asimetría</span>}
              </div>
            )
          })}

          {results.result && (
            <div className={`mt-3 rounded-xl p-3 text-center ${results.result.total >= 14 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-2xl font-bold ${results.result.total >= 14 ? 'text-green-700' : 'text-red-600'}`}>
                {results.result.total} <span className="text-sm font-normal">/ 21</span>
              </p>
              <p className={`text-xs mt-0.5 ${results.result.total >= 14 ? 'text-green-600' : 'text-red-500'}`}>
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
          <Stat label="Mano D arriba" value={results.distance_left_cm} unit="cm" colorClass="bg-purple-50" />
          <Stat label="Mano I arriba" value={results.distance_right_cm} unit="cm" colorClass="bg-purple-50" />
        </div>
      )}

      {method === 'y_balance' && (
        <div className="space-y-2 mt-2 text-xs">
          {[
            ['reach_anterior', 'Anterior'],
            ['reach_posteromedial', 'Posteromedial'],
            ['reach_posterolateral', 'Posterolateral'],
          ].map(([field, label]) => (
            (results[`${field}_l`] || results[`${field}_r`]) && (
              <div key={field} className="flex items-center gap-2">
                <span className="text-gray-600 flex-1">{label}</span>
                {results[`${field}_l`] && <span className="badge bg-purple-50 text-purple-600">I: {results[`${field}_l`]} cm</span>}
                {results[`${field}_r`] && <span className="badge bg-purple-50 text-purple-600">D: {results[`${field}_r`]} cm</span>}
              </div>
            )
          ))}
        </div>
      )}

      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function CustomView({ results }) {
  if (!results?.fields?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-1.5">
      {results.fields.filter(f => f.label || f.value).map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 flex-1">{f.label || `Campo ${i + 1}`}</span>
          <span className="font-semibold text-gray-900">{f.value}{f.unit ? ` ${f.unit}` : ''}</span>
        </div>
      ))}
      {results.notes && <p className="text-xs text-gray-500 italic border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function ResultViewer({ evalType, results }) {
  switch (evalType) {
    case 'one_rm':    return <OneRMView results={results} />
    case 'max_reps':  return <MaxRepsView results={results} />
    case 'power':     return <PowerView results={results} />
    case 'cardio':    return <CardioView results={results} />
    case 'body_comp': return <BodyCompView results={results} />
    case 'scored':    return <ScoredView results={results} />
    case 'custom':    return <CustomView results={results} />
    default:          return <pre className="text-xs text-gray-500 overflow-auto">{JSON.stringify(results, null, 2)}</pre>
  }
}

// ============================================================
// Student result card
// ============================================================
function StudentResultCard({ assignment, allResults, evalType }) {
  const [expanded, setExpanded] = useState(false)
  const studentResults = allResults
    .filter(r => r.student_id === assignment.student_id)
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
          onClick={e => e.stopPropagation()}
          className="p-1.5 text-gray-400 hover:text-gray-600"
        >
          <ExternalLink size={14} />
        </Link>
        {studentResults.length > 0 && (
          expanded
            ? <ChevronUp size={16} className="text-gray-400" />
            : <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {expanded && studentResults.length > 0 && (
        <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-5">
          {studentResults.map(res => (
            <div key={res.id}>
              <p className="text-xs font-semibold text-gray-400 mb-2">
                📅 {new Date(res.eval_date).toLocaleDateString('es-AR', {
                  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                })}
              </p>
              <ResultViewer evalType={evalType} results={res.results} />
              {res.notes && (
                <p className="text-xs text-gray-500 italic mt-2 border-t pt-2">
                  💬 {res.notes}
                </p>
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

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    try {
      const [planRes, assignmentsRes, resultsRes] = await Promise.all([
        supabase.from('plans').select('*').eq('id', id).single(),
        supabase.from('plan_assignments')
          .select('*, student:profiles!student_id(id, name)')
          .eq('plan_id', id)
          .eq('active', true),
        supabase.from('evaluation_results')
          .select('*')
          .eq('plan_id', id)
          .order('eval_date', { ascending: false }),
      ])
      setPlan(planRes.data)
      setAssignments(assignmentsRes.data || [])
      setResults(resultsRes.data || [])
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

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!plan) return <div className="text-center py-12 text-gray-500">Evaluación no encontrada</div>

  const typeInfo = EVAL_TYPES.find(e => e.key === plan.eval_type)

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{plan.title}</h1>
            {plan.eval_type && (
              <span className={`badge ${evalTypeColor(plan.eval_type)}`}>
                {evalTypeIcon(plan.eval_type)} {evalTypeLabel(plan.eval_type)}
              </span>
            )}
          </div>
          {plan.description && <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn-ghost p-2 text-gray-400 hover:text-red-500"
            title="Eliminar evaluación"
          >
            <Trash2 size={16} />
          </button>
          <Link to={`/coach/plans/${id}/edit`} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Edit2 size={14} />
            Editar
          </Link>
        </div>
      </div>

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
              ? new Date(results[0]?.eval_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
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
                {(METHODS[plan.eval_type] || []).map(m => (
                  <span key={m.key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
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
            {assignments.map(a => (
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
