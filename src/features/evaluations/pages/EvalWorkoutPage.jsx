import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import {
  emptyResults,
  evalTypeLabel,
  evalTypeIcon,
  isExerciseBasedEval,
  groupEvalExercisesByDay,
  buildExerciseResponseJson,
  calc1RM,
} from '../helpers'
import { ArrowLeft, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import {
  fetchEvalMirrorBodies,
  postEvalCommentNote,
  postEvalResultNote,
  fetchSingleMirrorBodies,
} from '@/features/notes/api'
import PowerForm from '../components/forms/PowerForm'
import CardioForm from '../components/forms/CardioForm'
import BodyCompForm from '../components/forms/BodyCompForm'
import ScoredForm from '../components/forms/ScoredForm'
import EvalByDayForm from '../components/forms/EvalByDayForm'

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
// Dispatcher de protocolos enteros (power/cardio/body_comp/scored).
// Los tipos exercise-based (one_rm/max_reps/custom/mixed) se renderizan
// con EvalByDayForm fuera de este dispatcher (doc 38).
// ============================================================
function ProtocolForm({ evalType, results, onChange, planMethod }) {
  const props = { results, onChange, planMethod }
  switch (evalType) {
    case 'power':
      return <PowerForm {...props} />
    case 'cardio':
      return <CardioForm {...props} />
    case 'body_comp':
      return <BodyCompForm {...props} />
    case 'scored':
      return <ScoredForm {...props} />
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
  const [notes, setNotes] = useState('')

  // Protocolos enteros (power/cardio/body_comp/scored): jsonb en results.
  const [results, setResults] = useState(null)

  // Evals exercise-based (doc 38): plan_exercises agrupados por día +
  // responses keyed por plan_exercise_id.
  const [exByDay, setExByDay] = useState({}) // { day_a: [pe], ... }
  const [exResponses, setExResponses] = useState({}) // { peId: { ...jsonb, comment } }

  // doc 43 (Modelo B): guardado por día con fecha propia (solo multi-día).
  // Una sola eval (un result); cada día con su fecha en results.day_dates.
  const [dayDates, setDayDates] = useState({}) // { day_a: 'YYYY-MM-DD', ... }
  const [resultDayDates, setResultDayDates] = useState({}) // day_dates persistido
  const [savingSection, setSavingSection] = useState(null)
  const [savedSections, setSavedSections] = useState(() => new Set())
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  const exerciseBased = plan ? isExerciseBasedEval(plan.eval_type) : false

  // Días con ejercicios + si la eval es de varios días (→ guardado por día).
  const dayKeys = Object.keys(exByDay).filter((k) => (exByDay[k] || []).length > 0)
  const multiDay = exerciseBased && dayKeys.length > 1

  // Secciones-día cubiertas por las responses cargadas.
  function computeCoveredSections(responsesMap, byDay) {
    const cov = new Set()
    for (const [sec, rows] of Object.entries(byDay)) {
      if ((rows || []).some((pe) => responsesMap[pe.id])) cov.add(sec)
    }
    return cov
  }

  useEffect(() => {
    fetchPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // ── Cargar las responses exercise-based de un resultado existente ──
  async function loadExerciseResponses(resultId) {
    const { data: respData } = await supabase
      .from('evaluation_test_responses')
      .select('*')
      .eq('evaluation_result_id', resultId)
    const respIds = (respData || []).map((r) => r.id)
    const evalMirrors = await fetchEvalMirrorBodies(respIds)
    const map = {}
    for (const r of respData || []) {
      // Compat: respuestas nuevas keyean por plan_exercise_id; las viejas
      // (pre-cutover) keyean por test_id. Usamos plan_exercise_id si existe.
      const key = r.plan_exercise_id || r.test_id
      if (!key) continue
      const mirror = evalMirrors.get(r.id)
      map[key] = {
        ...(r.student_response || {}),
        // alias para inputs custom legacy
        value: r.student_response?.value ?? '',
        unit: r.student_response?.unit ?? '',
        comment: mirror?.studentComment ?? r.student_comment ?? '',
      }
    }
    return map
  }

  async function fetchPlan() {
    try {
      const { data, error } = await supabase.from('plans').select('*').eq('id', planId).single()
      if (error) throw error
      setPlan(data)
      const today = new Date().toISOString().slice(0, 10)

      if (isExerciseBasedEval(data.eval_type)) {
        // Leer plan_exercises de la eval (sin hardcodear day_a) + join ejercicio.
        const { data: peData } = await supabase
          .from('plan_exercises')
          .select('*, exercises(name, video_url)')
          .eq('plan_id', planId)
          .order('order_index')
        let rows = peData || []

        // Compat hacia atrás: evals custom pre-cutover viven en
        // evaluation_tests. Si no hay filas en plan_exercises, mapearlas.
        if (rows.length === 0 && data.eval_type === 'custom') {
          const { data: testsData } = await supabase
            .from('evaluation_tests')
            .select('*, exercises(name, video_url)')
            .eq('plan_id', planId)
            .order('order_index')
          rows = (testsData || []).map((t) => ({
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
            exercises: t.exercises,
            __legacyTest: true,
          }))
        }

        const grouped = groupEvalExercisesByDay(rows)
        setExByDay(grouped)
        const dayKeysLocal = Object.keys(grouped).filter((k) => (grouped[k] || []).length > 0)
        const multiDayLocal = dayKeysLocal.length > 1

        if (multiDayLocal) {
          // Modelo B (doc 43): una sola eval; cargar el intento EN CURSO
          // (el result más reciente que aún no completó todos los días). Si el
          // más reciente está completo, arrancar un intento nuevo (vacío).
          const defaults = {}
          for (const k of dayKeysLocal) defaults[k] = today

          const { data: recents } = await supabase
            .from('evaluation_results')
            .select('*')
            .eq('plan_id', planId)
            .eq('student_id', user.id)
            .order('eval_date', { ascending: false })
            .limit(1)
          const recent = recents?.[0]
          if (recent) {
            const respMap = await loadExerciseResponses(recent.id)
            const covered = computeCoveredSections(respMap, grouped)
            if (covered.size < dayKeysLocal.length) {
              // intento en curso → continuar
              const savedDates = recent.results?.day_dates || {}
              setExistingResultId(recent.id)
              setResultDayDates(savedDates)
              setDayDates({ ...defaults, ...savedDates })
              setSavedSections(covered)
              setExResponses(respMap)
              setNotes(await loadResultNotesFromPanel(recent.id))
            } else {
              // el último intento está completo → intento nuevo, vacío
              setDayDates(defaults)
            }
          } else {
            setDayDates(defaults)
          }
          return
        }

        // Eval de un solo día: flujo clásico (fecha global + un guardar).
        const { data: existing } = await supabase
          .from('evaluation_results')
          .select('*')
          .eq('plan_id', planId)
          .eq('student_id', user.id)
          .eq('eval_date', today)
          .maybeSingle()
        if (existing) {
          setExistingResultId(existing.id)
          setNotes(await loadResultNotesFromPanel(existing.id))
          setExResponses(await loadExerciseResponses(existing.id))
        }
        return
      }

      // ── Protocolos enteros (power/cardio/body_comp/scored) ──
      const initResults = emptyResults(data.eval_type, data.eval_method || '')
      setResults(initResults)

      const { data: existing } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('plan_id', planId)
        .eq('student_id', user.id)
        .eq('eval_date', today)
        .maybeSingle()
      if (existing) {
        setResults(existing.results)
        setNotes(await loadResultNotesFromPanel(existing.id))
        setExistingResultId(existing.id)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Cambio de fecha: resetea y carga resultado existente si lo hay
  async function handleDateChange(dateStr) {
    setEvalDate(dateStr)
    setEditing(false)
    setExistingResultId(null)
    setError(null)
    setNotes('')

    if (exerciseBased) {
      setExResponses({})
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
        setExResponses(await loadExerciseResponses(existing.id))
      }
      return
    }

    setResults(emptyResults(plan.eval_type, plan.eval_method || ''))
    const { data: existing } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('plan_id', planId)
      .eq('student_id', user.id)
      .eq('eval_date', dateStr)
      .maybeSingle()
    if (existing) {
      setResults(existing.results)
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
    if (!existing) return
    setNotes(await loadResultNotesFromPanel(existing.id))
    if (exerciseBased) {
      setExResponses(await loadExerciseResponses(existing.id))
    } else {
      setResults(existing.results)
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
      if (exerciseBased) setExResponses({})
      else setResults(emptyResults(plan.eval_type, plan.eval_method || ''))
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
      // Las evals exercise-based guardan results vacío (los datos van por
      // ejercicio en evaluation_test_responses); los protocolos enteros
      // mantienen su jsonb en results.
      const { data: upserted, error } = await supabase
        .from('evaluation_results')
        .upsert(
          {
            student_id: user.id,
            plan_id: planId,
            eval_date: evalDate,
            eval_type: plan.eval_type,
            results: exerciseBased ? {} : results,
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

      // 2. Exercise-based: una response por ejercicio keyed por plan_exercise_id.
      if (exerciseBased) {
        const allRows = Object.values(exByDay).flat()
        for (const pe of allRows) {
          const resp = exResponses[pe.id]
          if (!resp) continue
          const evalType = pe.eval_type || 'custom'
          // Recalcular 1RM estimado al guardar (por si cambió el método).
          const input = { ...resp }
          if (evalType === 'one_rm') {
            input.one_rm_estimated = calc1RM(pe.eval_method || 'brzycki', resp.weight_kg, resp.reps)
          }
          const studentResponse = buildExerciseResponseJson(evalType, input)

          // Pre-cutover: la fila viene de evaluation_tests → key por test_id.
          // Post-cutover / nuevas: key por plan_exercise_id.
          const keyField = pe.__legacyTest ? 'test_id' : 'plan_exercise_id'
          const { data: upsertedResp } = await supabase
            .from('evaluation_test_responses')
            .upsert(
              {
                evaluation_result_id: resultId,
                [keyField]: pe.id,
                student_response: studentResponse,
                updated_at: new Date().toISOString(),
              },
              { onConflict: `evaluation_result_id,${keyField}` }
            )
            .select('id')
            .single()

          if (upsertedResp?.id) {
            const { error: cErr } = await postEvalCommentNote({
              studentId: user.id,
              responseId: upsertedResp.id,
              body: resp.comment || '',
              role: 'student',
              visibility: 'shared',
            })
            if (cErr) {
              console.warn('[saveEval] no se pudo guardar el comment en el panel:', cErr)
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

  function updateExResponse(peId, field, value) {
    setExResponses((prev) => ({
      ...prev,
      [peId]: { ...(prev[peId] || {}), [field]: value },
    }))
  }

  function handleDayDateChange(section, dateStr) {
    setDayDates((prev) => ({ ...prev, [section]: dateStr }))
  }

  // doc 43 (Modelo B): guardar UN día. Una sola eval (un result); la fecha de
  // cada día va en results.day_dates. La eval queda completa (trigger) cuando
  // todos los días tienen responses.
  async function handleSaveDay(section) {
    setSavingSection(section)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const dayDate = dayDates[section] || today
      const newDayDates = { ...resultDayDates, [section]: dayDate }

      // 1. Asegurar el result del intento en curso.
      let resultId = existingResultId
      if (!resultId) {
        const { data: ins, error: insErr } = await supabase
          .from('evaluation_results')
          .insert({
            student_id: user.id,
            plan_id: planId,
            eval_date: dayDate,
            eval_type: plan.eval_type,
            results: { day_dates: newDayDates },
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        resultId = ins.id
        setExistingResultId(resultId)
      } else {
        const { error: updErr } = await supabase
          .from('evaluation_results')
          .update({ results: { day_dates: newDayDates }, updated_at: new Date().toISOString() })
          .eq('id', resultId)
        if (updErr) throw updErr
      }
      setResultDayDates(newDayDates)

      // 2. Nota general (una sola para toda la eval).
      const { error: noteErr } = await postEvalResultNote({
        studentId: user.id,
        resultId,
        body: notes || '',
      })
      if (noteErr) console.warn('[handleSaveDay] nota general:', noteErr)

      // 3. Responses de ESTE día.
      for (const pe of exByDay[section] || []) {
        const resp = exResponses[pe.id]
        if (!resp) continue
        const evalType = pe.eval_type || 'custom'
        const input = { ...resp }
        if (evalType === 'one_rm') {
          input.one_rm_estimated = calc1RM(pe.eval_method || 'brzycki', resp.weight_kg, resp.reps)
        }
        const studentResponse = buildExerciseResponseJson(evalType, input)
        const keyField = pe.__legacyTest ? 'test_id' : 'plan_exercise_id'
        const { data: upsertedResp } = await supabase
          .from('evaluation_test_responses')
          .upsert(
            {
              evaluation_result_id: resultId,
              [keyField]: pe.id,
              student_response: studentResponse,
              updated_at: new Date().toISOString(),
            },
            { onConflict: `evaluation_result_id,${keyField}` }
          )
          .select('id')
          .single()
        if (upsertedResp?.id) {
          const { error: cErr } = await postEvalCommentNote({
            studentId: user.id,
            responseId: upsertedResp.id,
            body: resp.comment || '',
            role: 'student',
            visibility: 'shared',
          })
          if (cErr) console.warn('[handleSaveDay] comment:', cErr)
        }
      }

      setSavedSections((prev) => new Set(prev).add(section))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al guardar el día')
    } finally {
      setSavingSection(null)
    }
  }

  // doc 43 iter: guardar la observación general (multi-día). Distinta de los
  // comentarios por ejercicio; va al result del intento en curso.
  async function handleSaveNote() {
    setSavingNote(true)
    setError(null)
    try {
      let resultId = existingResultId
      if (!resultId) {
        const today = new Date().toISOString().slice(0, 10)
        const { data: ins, error: insErr } = await supabase
          .from('evaluation_results')
          .insert({
            student_id: user.id,
            plan_id: planId,
            eval_date: today,
            eval_type: plan.eval_type,
            results: { day_dates: resultDayDates },
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        resultId = ins.id
        setExistingResultId(resultId)
      }
      const { error: noteErr } = await postEvalResultNote({
        studentId: user.id,
        resultId,
        body: notes || '',
      })
      if (noteErr) throw noteErr
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al guardar la observación')
    } finally {
      setSavingNote(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  if (!plan) return <div className="text-center py-12 text-gray-500">Evaluación no encontrada</div>
  if (!exerciseBased && !results) return null

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

      {/* Date selector — global solo para 1 día/protocolos. En multi-día cada
          día tiene su propia fecha dentro del formulario (Modelo B, doc 43). */}
      {!multiDay && (
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
      )}

      {/* Eval form */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Registro</h2>
        {multiDay && (
          <p className="text-xs text-gray-500 -mt-1">
            Cada día se guarda por separado con su fecha. La evaluación queda completa cuando cargás
            todos los días.
          </p>
        )}
        {exerciseBased ? (
          <EvalByDayForm
            exercisesByDay={exByDay}
            sessionsPerWeek={plan.sessions_per_week || 1}
            responses={exResponses}
            onChange={updateExResponse}
            perDaySave={multiDay}
            dayDates={dayDates}
            onDayDateChange={handleDayDateChange}
            onSaveDay={handleSaveDay}
            savingSection={savingSection}
            savedSections={savedSections}
            maxDate={new Date().toISOString().slice(0, 10)}
          />
        ) : (
          <ProtocolForm
            evalType={plan.eval_type}
            results={results}
            onChange={setResults}
            planMethod={plan.eval_method || ''}
          />
        )}
      </div>

      {/* General notes */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">
          {multiDay ? 'Observación general de la evaluación' : 'Observaciones del alumno'}
        </h2>
        {multiDay && (
          <p className="text-xs text-gray-500 -mt-1">
            Una nota para toda la evaluación (aparte del comentario de cada ejercicio).
          </p>
        )}
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="¿Cómo te sentiste? Algún dato adicional..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {multiDay && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveNote}
              disabled={savingNote}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {savingNote ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={15} /> Guardar observación
                </>
              )}
            </button>
            {noteSaved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle size={15} /> Guardada
              </span>
            )}
          </div>
        )}
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

        {multiDay /* Multi-día (Modelo B): el guardado es por día, dentro del formulario. */ ? null : existingResultId &&
          !editing ? (
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
