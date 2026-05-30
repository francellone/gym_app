import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import {
  emptyResults,
  evalTypeLabel,
  evalTypeIcon,
  buildInitialSetsArr,
  pruebaTypeInfo,
} from '../helpers'
import { ArrowLeft, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import { parseReps } from '@/features/plans/helpers'
import {
  fetchEvalMirrorBodies,
  postEvalCommentNote,
  postEvalResultNote,
  fetchSingleMirrorBodies,
} from '@/features/notes/api'
import OneRMForm from '../components/forms/OneRMForm'
import MaxRepsForm from '../components/forms/MaxRepsForm'
import PowerForm from '../components/forms/PowerForm'
import CardioForm from '../components/forms/CardioForm'
import BodyCompForm from '../components/forms/BodyCompForm'
import ScoredForm from '../components/forms/ScoredForm'
import CustomForm from '../components/forms/CustomForm'

// ============================================================
// Helper: leer la nota general de un evaluation_result desde el panel
// (post v26f: la columna evaluation_results.notes fue dropeada).
// ============================================================
async function loadResultNotesFromPanel(resultId) {
  if (!resultId) return ''
  const m = await fetchSingleMirrorBodies({
    contextType: 'evaluation_result',
    contextIds: [resultId],
  })
  return m.get(resultId) ?? ''
}

// MethodBadge, ResultBox, NumInput, SexSelector y ScoreButton viven en
// `../components/` desde el 21/05 (Tier 2.3 — batch 1).

// Helpers parseSuggestedWeightVal, buildSuggestedWeightsArr y
// buildInitialSetsArr movidos a `../helpers` (21/05, Tier 2.3 batch 2).

// ============================================================
// Dispatcher
// ============================================================
function EvalForm({
  evalType,
  results,
  onChange,
  planMethod,
  planExercises,
  pruebas,
  pruebaResponses,
  onChangePrueba,
}) {
  const props = { results, onChange, planMethod, planExercises }
  switch (evalType) {
    case 'one_rm':
      return <OneRMForm {...props} />
    case 'max_reps':
      return <MaxRepsForm {...props} />
    case 'power':
      return <PowerForm {...props} />
    case 'cardio':
      return <CardioForm {...props} />
    case 'body_comp':
      return <BodyCompForm {...props} />
    case 'scored':
      return <ScoredForm {...props} />
    case 'custom':
      return (
        <CustomForm
          pruebas={pruebas || []}
          responses={pruebaResponses || {}}
          onChange={onChangePrueba}
        />
      )
    default:
      return <p className="text-sm text-gray-400">Tipo de evaluación no reconocido.</p>
  }
}

// ============================================================
// Main page
// ============================================================
export default function EvalWorkoutPage() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [plan, setPlan] = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Editar / Desmarcar
  const [existingResultId, setExistingResultId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [evalDate, setEvalDate] = useState(new Date().toISOString().slice(0, 10))
  const [results, setResults] = useState(null)
  const [notes, setNotes] = useState('')

  // Estado exclusivo para evaluaciones custom (pruebas)
  const [pruebas, setPruebas] = useState([]) // evaluation_tests del plan
  const [pruebaResponses, setPruebaResponses] = useState({}) // { test_id: { value, unit, comment } }

  useEffect(() => {
    fetchPlan()
  }, [planId])

  async function fetchPlan() {
    try {
      const { data, error } = await supabase.from('plans').select('*').eq('id', planId).single()
      if (error) throw error
      setPlan(data)

      // Para tipo custom: cargar pruebas (evaluation_tests)
      if (data.eval_type === 'custom') {
        const { data: pruebasData } = await supabase
          .from('evaluation_tests')
          // B7 (30/05): joinear el ejercicio para traer su video de referencia.
          // Cada prueba puede linkear a un exercise (exercise_id) que tiene
          // video_url (link de Drive/YouTube cargado por el coach). Sin este
          // join el alumno nunca veía el video en la evaluación asignada.
          .select('*, exercises(video_url)')
          .eq('plan_id', planId)
          .order('order_index')
        // Normalizamos video_url al nivel de la prueba para que CustomForm
        // no tenga que conocer la forma del join.
        setPruebas(
          (pruebasData || []).map((p) => ({
            ...p,
            video_url: p.exercises?.video_url || null,
          }))
        )
        setResults({ notes: '' })

        // Load existing result for today (custom)
        const { data: existing } = await supabase
          .from('evaluation_results')
          .select('*')
          .eq('plan_id', planId)
          .eq('student_id', user.id)
          .eq('eval_date', new Date().toISOString().slice(0, 10))
          .maybeSingle()

        if (existing) {
          setExistingResultId(existing.id)
          setNotes(await loadResultNotesFromPanel(existing.id))
          // Cargar las responses existentes
          const { data: respData } = await supabase
            .from('evaluation_test_responses')
            .select('*')
            .eq('evaluation_result_id', existing.id)
          // Round 2a: merge body de notas mirror eval (context_id=etr.id)
          // sobre student_comment, para que muestre la versión del panel.
          const respIds = (respData || []).map((r) => r.id)
          const evalMirrors = await fetchEvalMirrorBodies(respIds)
          const map = {}
          for (const r of respData || []) {
            const mirror = evalMirrors.get(r.id)
            map[r.test_id] = {
              value: r.student_response?.value || '',
              unit: r.student_response?.unit || '',
              comment: mirror?.studentComment ?? r.student_comment ?? '',
            }
          }
          setPruebaResponses(map)
        }
        return // early return — no sigue con lógica científica
      }

      // For exercise-based eval types, pre-load the plan's exercises
      let planEx = []
      if (['one_rm', 'max_reps'].includes(data.eval_type)) {
        const { data: exData } = await supabase
          .from('plan_exercises')
          .select('*, exercises(name, video_url)')
          .eq('plan_id', planId)
          .eq('section', 'day_a')
          .order('order_index')
        planEx = exData || []
        setPlanExercises(planEx)
      }

      // Build initial results with method and pre-loaded exercises
      const initResults = emptyResults(data.eval_type, data.eval_method || '')
      if (planEx.length > 0) {
        initResults.exercises = planEx.map((pe) => ({
          exercise_id: pe.exercise_id,
          name: pe.exercises?.name || 'Ejercicio',
          video_url: pe.exercises?.video_url || null,
          sets_arr: buildInitialSetsArr(pe, data.eval_type, parseReps),
          best_one_rm: null,
          weight_kg: '',
          reps: '',
          one_rm: null,
        }))
      }
      setResults(initResults)

      // Load existing result for today (if any)
      const { data: existing } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('plan_id', planId)
        .eq('student_id', user.id)
        .eq('eval_date', new Date().toISOString().slice(0, 10))
        .maybeSingle()

      if (existing) {
        let loadedResults = existing.results
        if (planEx.length > 0 && loadedResults.exercises) {
          loadedResults = {
            ...loadedResults,
            exercises: loadedResults.exercises.map((ex, i) => {
              const pe = planEx[i]
              const enriched = {
                ...ex,
                name: ex.name || pe?.exercises?.name || `Ejercicio ${i + 1}`,
                video_url: pe?.exercises?.video_url || ex.video_url || null,
              }
              // Migrar formato viejo (sin sets_arr) → un set con los datos guardados
              if (!enriched.sets_arr) {
                enriched.sets_arr = [
                  {
                    weight_kg: ex.weight_kg || '',
                    reps: ex.reps || '',
                    ...(data.eval_type === 'one_rm' ? { one_rm: ex.one_rm || null } : {}),
                  },
                ]
              }
              return enriched
            }),
          }
        }
        setResults(loadedResults)
        setNotes(await loadResultNotesFromPanel(existing.id))
        setExistingResultId(existing.id)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers internos ─────────────────────────────────────
  function makeFreshResults(evalType, evalMethod, planEx) {
    const init = emptyResults(evalType, evalMethod || '')
    if (planEx.length > 0) {
      init.exercises = planEx.map((pe) => ({
        exercise_id: pe.exercise_id,
        name: pe.exercises?.name || 'Ejercicio',
        video_url: pe.exercises?.video_url || null,
        sets_arr: buildInitialSetsArr(pe, evalType, parseReps),
        best_one_rm: null,
        weight_kg: '',
        reps: '',
        one_rm: null,
      }))
    }
    return init
  }

  function enrichExercises(exercises, planEx, evalType) {
    return exercises.map((ex, i) => {
      const pe = planEx[i]
      const enriched = {
        ...ex,
        name: ex.name || pe?.exercises?.name || `Ejercicio ${i + 1}`,
        video_url: pe?.exercises?.video_url || ex.video_url || null,
      }
      if (!enriched.sets_arr) {
        enriched.sets_arr = [
          {
            weight_kg: ex.weight_kg || '',
            reps: ex.reps || '',
            ...(evalType === 'one_rm' ? { one_rm: ex.one_rm || null } : {}),
          },
        ]
      }
      return enriched
    })
  }

  // Cambio de fecha: resetea y carga resultado existente si lo hay
  async function handleDateChange(dateStr) {
    setEvalDate(dateStr)
    setEditing(false)
    setExistingResultId(null)
    setError(null)
    setNotes('')

    if (plan.eval_type === 'custom') {
      setPruebaResponses({})
      const { data: existing } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('plan_id', planId)
        .eq('student_id', user.id)
        .eq('eval_date', dateStr)
        .maybeSingle()
      if (existing) {
        setExistingResultId(existing.id)
        setNotes(await loadResultNotesFromPanel(existing.id))
        const { data: respData } = await supabase
          .from('evaluation_test_responses')
          .select('*')
          .eq('evaluation_result_id', existing.id)
        // Round 2a: merge mirror eval body sobre student_comment
        const respIds = (respData || []).map((r) => r.id)
        const evalMirrors = await fetchEvalMirrorBodies(respIds)
        const map = {}
        for (const r of respData || []) {
          const mirror = evalMirrors.get(r.id)
          map[r.test_id] = {
            value: r.student_response?.value || '',
            unit: r.student_response?.unit || '',
            comment: mirror?.studentComment ?? r.student_comment ?? '',
          }
        }
        setPruebaResponses(map)
      }
      return
    }

    setResults(makeFreshResults(plan.eval_type, plan.eval_method, planExercises))

    const { data: existing } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('plan_id', planId)
      .eq('student_id', user.id)
      .eq('eval_date', dateStr)
      .maybeSingle()

    if (existing) {
      let loaded = existing.results
      if (planExercises.length > 0 && loaded.exercises) {
        loaded = {
          ...loaded,
          exercises: enrichExercises(loaded.exercises, planExercises, plan.eval_type),
        }
      }
      setResults(loaded)
      setNotes(await loadResultNotesFromPanel(existing.id))
      setExistingResultId(existing.id)
    }
  }

  // Cancelar edición: recarga los datos guardados
  async function handleCancelEdit() {
    setEditing(false)
    setError(null)
    if (!existingResultId) return
    const { data: existing } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('id', existingResultId)
      .single()
    if (existing) {
      let loaded = existing.results
      if (planExercises.length > 0 && loaded.exercises) {
        loaded = {
          ...loaded,
          exercises: enrichExercises(loaded.exercises, planExercises, plan.eval_type),
        }
      }
      setResults(loaded)
      setNotes(await loadResultNotesFromPanel(existing.id))
    }
  }

  // Borrar resultado
  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('evaluation_results')
        .delete()
        .eq('id', existingResultId)
      if (error) throw error
      setResults(makeFreshResults(plan.eval_type, plan.eval_method, planExercises))
      setNotes('')
      setExistingResultId(null)
      setConfirmDelete(false)
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Error al desmarcar')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // 1. Upsert evaluation_result. v26f: la columna `notes` se dropeó;
      // ahora la observación general va al panel via postEvalResultNote.
      // Para custom seguimos guardando { notes } dentro del jsonb `results`
      // (compat con readers de detail page mientras migran).
      const { data: upserted, error } = await supabase
        .from('evaluation_results')
        .upsert(
          {
            student_id: user.id,
            plan_id: planId,
            eval_date: evalDate,
            eval_type: plan.eval_type,
            results: plan.eval_type === 'custom' ? { notes } : results,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'student_id,plan_id,eval_date' }
        )
        .select('id')
        .single()
      if (error) throw error
      const resultId = upserted.id

      // 1.b — guardar nota general en el panel
      const { error: noteErr } = await postEvalResultNote({
        studentId: user.id,
        resultId,
        body: notes || '',
      })
      if (noteErr) {
        console.warn('[handleSave] no se pudo guardar la nota general en el panel:', noteErr)
      }

      // 2. Para custom: upsert evaluation_test_responses
      if (plan.eval_type === 'custom') {
        for (const prueba of pruebas) {
          const resp = pruebaResponses[prueba.id]
          if (!resp && !resp?.value) continue
          // Round 2b: ya no escribimos student_comment a la columna
          // (dropeada en v26d). Después del upsert llamamos a
          // postEvalCommentNote() con el body, que aterriza en el panel.
          const { data: upsertedResp } = await supabase
            .from('evaluation_test_responses')
            .upsert(
              {
                evaluation_result_id: resultId,
                test_id: prueba.id,
                student_response: {
                  value: resp?.value || '',
                  unit: resp?.unit || pruebaTypeInfo(prueba.test_type)?.unit || '',
                },
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'evaluation_result_id,test_id' }
            )
            .select('id')
            .single()

          if (upsertedResp?.id) {
            const { error: noteErr } = await postEvalCommentNote({
              studentId: user.id,
              responseId: upsertedResp.id,
              body: resp?.comment || '',
              role: 'student',
              visibility: 'shared',
            })
            if (noteErr) {
              console.warn('[saveEval] no se pudo guardar el comment en el panel:', noteErr)
            }
          }
        }
      }

      setExistingResultId(resultId)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al guardar')
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

  if (!plan) return <div className="text-center py-12 text-gray-500">Evaluación no encontrada</div>
  if (!results && plan.eval_type !== 'custom') return null

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Modal: confirmar borrado */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">¿Desmarcar evaluación?</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  Se borrarán los datos del{' '}
                  <strong>
                    {new Date(evalDate + 'T12:00:00').toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </strong>
                  . Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 size={14} /> Sí, desmarcar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{evalTypeIcon(plan.eval_type)}</span>
            <h1 className="text-lg font-bold text-gray-900 truncate">{plan.title}</h1>
          </div>
          <p className="text-sm text-gray-500">{evalTypeLabel(plan.eval_type)}</p>
        </div>
      </div>

      {/* Date selector */}
      <div className="card">
        <label className="label">Fecha de evaluación</label>
        <input
          type="date"
          className="input"
          value={evalDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => handleDateChange(e.target.value)}
        />
      </div>

      {/* Eval form */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Registro</h2>
        <EvalForm
          evalType={plan.eval_type}
          results={results}
          onChange={setResults}
          planMethod={plan.eval_method || ''}
          planExercises={planExercises}
          pruebas={pruebas}
          pruebaResponses={pruebaResponses}
          onChangePrueba={(testId, field, value) =>
            setPruebaResponses((prev) => ({
              ...prev,
              [testId]: {
                ...(prev[testId] || { value: '', unit: '', comment: '' }),
                [field]: value,
              },
            }))
          }
        />
      </div>

      {/* General notes */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Observaciones del alumno</h2>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="¿Cómo te sentiste? Algún dato adicional..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Zona de acción: varía según estado */}
      <div className="pb-8 space-y-3">
        {/* Error visible en cualquier modo */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Flash de guardado exitoso */}
        {saved && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl p-3 text-sm">
            <CheckCircle size={16} />
            <span>{editing ? '¡Cambios guardados!' : '¡Evaluación guardada!'}</span>
          </div>
        )}

        {existingResultId && !editing ? (
          /* ── Resultado guardado: banner con Editar / Desmarcar ── */
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-800 flex-1">Evaluación registrada</p>
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                Editar
              </button>
              <span className="text-gray-300 select-none">·</span>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
              >
                <Trash2 size={13} /> Desmarcar
              </button>
            </div>
          </div>
        ) : existingResultId && editing ? (
          /* ── Editando resultado existente ── */
          <div className="flex gap-2">
            <button
              onClick={handleCancelEdit}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
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
        ) : (
          /* ── Sin resultado guardado: primer registro ── */
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save size={16} /> Guardar evaluación
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
