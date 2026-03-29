import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  EVAL_TYPES, evalTypeColor, evalTypeLabel, evalTypeIcon,
  MOVEMENT_SCREEN_PATTERNS, SCREEN_SCORES, ROM_ZONES, SKINFOLD_SITES, cooperVO2Max
} from '../../utils/evalHelpers'
import { ArrowLeft, Users, Calendar, ChevronDown, ChevronUp, Edit2, ExternalLink } from 'lucide-react'

// ---- Per-result viewers per eval_type -------------------

function MovementScreenView({ results }) {
  if (!results?.patterns) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-4">
      {results.patterns.map((pattern, pi) => {
        const def = MOVEMENT_SCREEN_PATTERNS.find(p => p.key === pattern.key)
        if (!def) return null
        return (
          <div key={pattern.key}>
            <p className="text-xs font-semibold text-gray-700 mb-2">{def.label}</p>
            <div className="space-y-1.5">
              {def.criteria.map(c => {
                const val = pattern.criteria?.[c.key]
                if (!val) return null
                const leftScore = SCREEN_SCORES.find(s => s.value === val.left)
                const rightScore = SCREEN_SCORES.find(s => s.value === val.right)
                return (
                  <div key={c.key} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 flex-1">{c.label}</span>
                    {leftScore && <span className={`badge ${leftScore.color}`}>I: {leftScore.label}</span>}
                    {rightScore && <span className={`badge ${rightScore.color}`}>D: {rightScore.label}</span>}
                    {val.obs && <span className="text-gray-400 italic truncate">{val.obs}</span>}
                  </div>
                )
              })}
            </div>
            {pattern.obs && (
              <p className="text-xs text-gray-500 mt-1 italic">{pattern.obs}</p>
            )}
          </div>
        )
      })}
      {results.general_notes && (
        <p className="text-sm text-gray-600 border-t pt-2">{results.general_notes}</p>
      )}
    </div>
  )
}

function StrengthAmrapView({ results }) {
  if (!results?.exercises?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-2">
      {results.exercises.map((ex, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="font-medium text-gray-900 flex-1">{ex.name}</span>
          {ex.reps && <span className="badge bg-red-100 text-red-700">{ex.reps} reps</span>}
          {ex.weight && <span className="badge bg-gray-100 text-gray-700">{ex.weight} kg</span>}
          {ex.notes && <span className="text-xs text-gray-400 italic">{ex.notes}</span>}
        </div>
      ))}
      {results.notes && <p className="text-sm text-gray-500 border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function FlexibilityRomView({ results }) {
  if (!results?.measurements?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  const filled = results.measurements.filter(m => m.left_deg || m.right_deg)
  if (!filled.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-1.5">
      {filled.map((m, i) => {
        const zone = ROM_ZONES.find(z => z.key === m.zone)
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-gray-700 flex-1">{zone?.label || m.zone}</span>
            {m.left_deg && <span className="badge bg-green-100 text-green-700">I: {m.left_deg}°</span>}
            {m.right_deg && <span className="badge bg-green-100 text-green-700">D: {m.right_deg}°</span>}
          </div>
        )
      })}
      {results.notes && <p className="text-sm text-gray-500 border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function JumpView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  const best = results.attempts?.filter(a => a.cm).map(a => parseFloat(a.cm)).filter(v => !isNaN(v))
  const max = best?.length ? Math.max(...best) : null
  return (
    <div className="space-y-2">
      {max && (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900">{max}</span>
          <span className="text-sm text-gray-500">cm (mejor intento)</span>
        </div>
      )}
      {results.attempts?.map((a, i) => a.cm && (
        <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
          <span>Intento {i + 1}:</span>
          <span className="font-medium">{a.cm} cm</span>
          {a.notes && <span className="text-gray-400 italic">{a.notes}</span>}
        </div>
      ))}
      {results.technique_notes && <p className="text-sm text-gray-500 border-t pt-2">{results.technique_notes}</p>}
    </div>
  )
}

function CooperView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  const vo2 = results.distance_m ? cooperVO2Max(results.distance_m) : null
  return (
    <div className="space-y-2">
      {results.distance_m && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{results.distance_m} m</p>
            <p className="text-xs text-blue-500">Distancia (12 min)</p>
          </div>
          {vo2 && (
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{vo2}</p>
              <p className="text-xs text-blue-500">VO₂ max (ml/kg/min)</p>
            </div>
          )}
        </div>
      )}
      {results.heart_rate_end && (
        <p className="text-sm text-gray-600">FC final: {results.heart_rate_end} bpm</p>
      )}
      {results.notes && <p className="text-sm text-gray-500 border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function BodyCompView({ results }) {
  if (!results) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {results.weight_kg && (
          <div className="bg-orange-50 rounded-xl p-2">
            <p className="text-lg font-bold text-orange-700">{results.weight_kg} kg</p>
            <p className="text-xs text-orange-500">Peso</p>
          </div>
        )}
        {results.body_fat_pct && (
          <div className="bg-orange-50 rounded-xl p-2">
            <p className="text-lg font-bold text-orange-700">{results.body_fat_pct}%</p>
            <p className="text-xs text-orange-500">Grasa corporal</p>
          </div>
        )}
        {results.muscle_mass_kg && (
          <div className="bg-orange-50 rounded-xl p-2">
            <p className="text-lg font-bold text-orange-700">{results.muscle_mass_kg} kg</p>
            <p className="text-xs text-orange-500">Masa muscular</p>
          </div>
        )}
      </div>
      {results.skinfolds && Object.entries(results.skinfolds).filter(([_, v]) => v).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Pliegues cutáneos</p>
          <div className="grid grid-cols-2 gap-1">
            {SKINFOLD_SITES.map(s => results.skinfolds?.[s.key] ? (
              <div key={s.key} className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1">
                <span>{s.label.replace(' (mm)', '')}</span>
                <span className="font-medium">{results.skinfolds[s.key]} mm</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}
      {results.notes && <p className="text-sm text-gray-500 border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function CustomView({ results }) {
  if (!results?.fields?.length) return <p className="text-sm text-gray-400">Sin datos</p>
  return (
    <div className="space-y-1.5">
      {results.fields.filter(f => f.label || f.value).map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-gray-700 flex-1">{f.label || `Campo ${i+1}`}</span>
          <span className="font-medium text-gray-900">{f.value}{f.unit ? ` ${f.unit}` : ''}</span>
        </div>
      ))}
      {results.notes && <p className="text-sm text-gray-500 border-t pt-2">{results.notes}</p>}
    </div>
  )
}

function ResultViewer({ evalType, results }) {
  switch (evalType) {
    case 'movement_screen': return <MovementScreenView results={results} />
    case 'strength_amrap': return <StrengthAmrapView results={results} />
    case 'flexibility_rom': return <FlexibilityRomView results={results} />
    case 'jump': return <JumpView results={results} />
    case 'cardio_cooper': return <CooperView results={results} />
    case 'body_comp': return <BodyCompView results={results} />
    case 'custom': return <CustomView results={results} />
    default: return <pre className="text-xs text-gray-500">{JSON.stringify(results, null, 2)}</pre>
  }
}

// ---- Student results card ---------------------------------

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
        onClick={() => setExpanded(!expanded)}
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
          expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {expanded && studentResults.length > 0 && (
        <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-4">
          {studentResults.map(res => (
            <div key={res.id}>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                📅 {new Date(res.eval_date).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <ResultViewer evalType={evalType} results={res.results} />
              {res.notes && (
                <p className="text-xs text-gray-500 italic mt-2 border-t pt-2">{res.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Main page --------------------------------------------

export default function EvaluationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

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
        <Link to={`/coach/plans/${id}/edit`} className="btn-secondary flex items-center gap-1.5 text-sm">
          <Edit2 size={14} />
          Editar
        </Link>
      </div>

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
        <div className="card bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{typeInfo.icon}</span>
            <div>
              <p className="font-semibold text-gray-900">{typeInfo.label}</p>
              <p className="text-sm text-gray-500">{typeInfo.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Students & Results */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm text-gray-900">
            Resultados por alumno
          </h3>
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

      {/* No results at all */}
      {assignments.length > 0 && results.length === 0 && (
        <div className="card text-center py-6">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Los alumnos aún no han registrado evaluaciones</p>
        </div>
      )}
    </div>
  )
}
