import { Plus, Trash2, PlayCircle } from 'lucide-react'
import { parseReps } from '@/features/plans/helpers'
import { calc1RM, buildSuggestedWeightsArr } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'

// ============================================================
// FORM: 1RM (Fuerza Máxima)
// ============================================================
// Calcula 1RM estimado (fórmula Epley / Brzycki según planMethod)
// para cada ejercicio del plan. Soporta múltiples sets por ejercicio,
// múltiples ejercicios. Mantiene el "best 1RM" del set ganador.
export default function OneRMForm({ results, onChange, planMethod, planExercises }) {
  const method = planMethod || results.method || 'brzycki'
  const usePlanExercises = planExercises && planExercises.length > 0

  // ── Modo libre (sin ejercicios del plan) ───────────────────
  function updateExercise(i, field, value) {
    const exercises = [...(results.exercises || [])]
    exercises[i] = { ...exercises[i], [field]: value }
    if (field === 'weight_kg' || field === 'reps') {
      const w = field === 'weight_kg' ? value : exercises[i].weight_kg
      const r = field === 'reps' ? value : exercises[i].reps
      exercises[i].one_rm = calc1RM(method, w, r)
    }
    onChange({ ...results, method, exercises })
  }

  function addExercise() {
    const ex = { name: '', weight_kg: '', reps: '', one_rm: null }
    onChange({ ...results, method, exercises: [...(results.exercises || []), ex] })
  }

  function removeExercise(i) {
    onChange({ ...results, exercises: results.exercises.filter((_, idx) => idx !== i) })
  }

  // ── Modo con plan: grilla por serie ───────────────────────
  function updateSet(exIdx, setIdx, field, value) {
    const exercises = [...(results.exercises || [])]
    const ex = { ...exercises[exIdx] }
    const sets_arr = [...(ex.sets_arr || [{ weight_kg: '', reps: '', one_rm: null }])]
    sets_arr[setIdx] = { ...sets_arr[setIdx], [field]: value }

    const w = field === 'weight_kg' ? value : sets_arr[setIdx].weight_kg
    const r = field === 'reps' ? value : sets_arr[setIdx].reps
    sets_arr[setIdx].one_rm =
      w && r && parseFloat(w) > 0 && parseInt(r) > 0 ? calc1RM(method, w, r) : null

    const best = sets_arr.reduce(
      (max, s) => (s.one_rm != null && (max === null || s.one_rm > max) ? s.one_rm : max),
      null
    )
    exercises[exIdx] = { ...ex, sets_arr, best_one_rm: best, one_rm: best }
    onChange({ ...results, method, exercises })
  }

  function addSet(exIdx) {
    const exercises = [...(results.exercises || [])]
    const ex = { ...exercises[exIdx] }
    exercises[exIdx] = {
      ...ex,
      sets_arr: [...(ex.sets_arr || []), { weight_kg: '', reps: '', one_rm: null }],
    }
    onChange({ ...results, exercises })
  }

  function removeSet(exIdx, setIdx) {
    const exercises = [...(results.exercises || [])]
    const ex = { ...exercises[exIdx] }
    if ((ex.sets_arr || []).length <= 1) return
    const sets_arr = ex.sets_arr.filter((_, i) => i !== setIdx)
    const best = sets_arr.reduce(
      (max, s) => (s.one_rm != null && (max === null || s.one_rm > max) ? s.one_rm : max),
      null
    )
    exercises[exIdx] = { ...ex, sets_arr, best_one_rm: best, one_rm: best }
    onChange({ ...results, exercises })
  }

  return (
    <div className="space-y-5">
      <MethodBadge evalType="one_rm" methodKey={method} />

      {(results.exercises || []).map((ex, i) => {
        const pe = planExercises[i]
        const setsCount = parseInt(pe?.suggested_sets) || 1
        const sugWeightsArr = pe ? buildSuggestedWeightsArr(pe, setsCount) : []
        const sugRepsArr = pe ? parseReps(pe.suggested_reps) : []
        // Migrar datos viejos (sin sets_arr) a un array de 1 set
        const sets_arr = ex.sets_arr || [
          { weight_kg: ex.weight_kg || '', reps: ex.reps || '', one_rm: ex.one_rm || null },
        ]

        return (
          <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
            {/* Header: nombre + video */}
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold break-words ${usePlanExercises ? 'text-sm text-gray-900' : 'text-xs text-gray-500'}`}
              >
                {ex.name || `Ejercicio ${i + 1}`}
              </span>
              {ex.video_url && ex.video_url.startsWith('http') && (
                <a
                  href={ex.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                  title="Ver video del ejercicio"
                >
                  <PlayCircle size={16} />
                </a>
              )}
              {!usePlanExercises && (results.exercises || []).length > 1 && (
                <button
                  onClick={() => removeExercise(i)}
                  className="ml-auto text-red-400 hover:text-red-600 p-1 flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Modo libre: input de nombre */}
            {!usePlanExercises && (
              <input
                className="input text-sm"
                placeholder="Nombre del ejercicio (ej: Sentadilla, Press banca...)"
                value={ex.name || ''}
                onChange={(e) => updateExercise(i, 'name', e.target.value)}
              />
            )}

            {/* Nota del coach */}
            {usePlanExercises && pe?.notes && (
              <p className="text-xs text-blue-600 italic">📝 {pe.notes}</p>
            )}

            {/* Modo con plan: grilla por serie */}
            {usePlanExercises ? (
              <div>
                {/* Encabezados de columna con sugeridos */}
                <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] gap-1.5 mb-1 px-0.5">
                  <div />
                  <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                    Reps
                    {sugRepsArr.some(Boolean) && (
                      <span className="block font-normal normal-case text-primary-400">
                        sug: {sugRepsArr.filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                    Peso (kg)
                    {sugWeightsArr.some(Boolean) && (
                      <span className="block font-normal normal-case text-primary-400">
                        sug: {sugWeightsArr.filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                    1RM
                  </div>
                </div>

                {/* Fila por serie */}
                {sets_arr.map((set, si) => (
                  <div
                    key={si}
                    className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] gap-1.5 mb-1.5 items-center"
                  >
                    <div className="text-xs text-center text-gray-400 font-medium">{si + 1}</div>
                    <input
                      className="input text-sm text-center py-1.5"
                      placeholder={String(sugRepsArr[si] || '—')}
                      value={set.reps || ''}
                      onChange={(e) => updateSet(i, si, 'reps', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input text-sm text-center py-1.5"
                      placeholder={sugWeightsArr[si] || '0'}
                      value={set.weight_kg || ''}
                      onChange={(e) => updateSet(i, si, 'weight_kg', e.target.value)}
                    />
                    <div className="flex items-center justify-between gap-0.5 pl-1">
                      <span className="text-xs font-semibold text-primary-600 flex-1 text-center">
                        {set.one_rm != null ? `${set.one_rm}` : '—'}
                      </span>
                      {sets_arr.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSet(i, si)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addSet(i)}
                  className="text-xs text-primary-500 hover:text-primary-700 flex items-center gap-1 mt-0.5 transition-colors"
                >
                  <Plus size={11} /> Agregar serie
                </button>

                {/* Mejor 1RM destacado */}
                {(ex.best_one_rm != null || sets_arr.some((s) => s.one_rm != null)) && (
                  <ResultBox
                    label={`Mejor 1RM estimado (${method})`}
                    value={
                      ex.best_one_rm ??
                      sets_arr.reduce(
                        (m, s) => (s.one_rm != null && s.one_rm > (m ?? 0) ? s.one_rm : m),
                        null
                      )
                    }
                    unit="kg"
                    sub={`${sets_arr.filter((s) => s.one_rm != null).length} intento(s) calculado(s)`}
                  />
                )}
              </div>
            ) : (
              /* Modo libre: un solo peso/reps */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <NumInput
                    label="Peso levantado"
                    unit="kg"
                    step="0.5"
                    placeholder="80"
                    value={ex.weight_kg || ''}
                    onChange={(v) => updateExercise(i, 'weight_kg', v)}
                  />
                  <NumInput
                    label="Repeticiones"
                    placeholder="6"
                    value={ex.reps || ''}
                    onChange={(v) => updateExercise(i, 'reps', v)}
                    hint="Máx 30 reps"
                  />
                </div>
                {ex.one_rm !== null && ex.one_rm !== undefined && (
                  <ResultBox
                    label={`1RM estimado (${method})`}
                    value={ex.one_rm}
                    unit="kg"
                    sub="Repetición máxima calculada"
                  />
                )}
              </>
            )}
          </div>
        )
      })}

      {!usePlanExercises && (
        <button
          type="button"
          onClick={addExercise}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={14} /> Agregar ejercicio
        </button>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones, observaciones..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
