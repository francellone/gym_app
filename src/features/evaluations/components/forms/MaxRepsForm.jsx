import { Plus, Trash2, PlayCircle } from 'lucide-react'
import { parseReps } from '@/features/plans/helpers'
import { buildSuggestedWeightsArr } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'

// ============================================================
// FORM: Max Reps (Fuerza-Resistencia)
// ============================================================
// Máximas repeticiones hasta el fallo o en tiempo fijo. Por ejercicio
// del plan, múltiples sets con peso fijo y reps variables.
export default function MaxRepsForm({ results, onChange, planMethod, planExercises }) {
  const method = planMethod || results.method || 'pushup'
  const usePlanExercises = planExercises && planExercises.length > 0
  const needsWeight = method === 'submax'
  const needsTime = method === 'situp'

  if (usePlanExercises) {
    // ── Grilla por serie para cada ejercicio ──────────────
    function updateSet(exIdx, setIdx, field, value) {
      const exercises = [...(results.exercises || [])]
      const ex = { ...exercises[exIdx] }
      const sets_arr = [...(ex.sets_arr || [{ reps: '', weight_kg: '' }])]
      sets_arr[setIdx] = { ...sets_arr[setIdx], [field]: value }
      exercises[exIdx] = { ...ex, sets_arr }
      onChange({ ...results, method, exercises })
    }

    function addSet(exIdx) {
      const exercises = [...(results.exercises || [])]
      const ex = { ...exercises[exIdx] }
      exercises[exIdx] = { ...ex, sets_arr: [...(ex.sets_arr || []), { reps: '', weight_kg: '' }] }
      onChange({ ...results, exercises })
    }

    function removeSet(exIdx, setIdx) {
      const exercises = [...(results.exercises || [])]
      const ex = { ...exercises[exIdx] }
      if ((ex.sets_arr || []).length <= 1) return
      exercises[exIdx] = { ...ex, sets_arr: ex.sets_arr.filter((_, i) => i !== setIdx) }
      onChange({ ...results, exercises })
    }

    const colCount = needsWeight ? '[1.5rem_1fr_1fr]' : '[1.5rem_1fr]'

    return (
      <div className="space-y-5">
        <MethodBadge evalType="max_reps" methodKey={method} />

        {(results.exercises || []).map((ex, i) => {
          const pe = planExercises[i]
          const setsCount = parseInt(pe?.suggested_sets) || 1
          const sugWeightsArr = pe ? buildSuggestedWeightsArr(pe, setsCount) : []
          const sugRepsArr = pe ? parseReps(pe.suggested_reps) : []
          const sets_arr = ex.sets_arr || [{ reps: ex.reps || '', weight_kg: ex.weight_kg || '' }]

          return (
            <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 break-words">
                  {ex.name || `Ejercicio ${i + 1}`}
                </p>
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
              </div>

              {pe?.notes && <p className="text-xs text-blue-600 italic">📝 {pe.notes}</p>}

              {/* Encabezados de columna */}
              <div className={`grid grid-cols-${colCount} gap-1.5 mb-1 px-0.5`}>
                <div />
                <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                  {needsTime ? 'Reps (60 seg)' : 'Reps máx'}
                  {sugRepsArr.some(Boolean) && (
                    <span className="block font-normal normal-case text-primary-400">
                      sug: {sugRepsArr.filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
                {needsWeight && (
                  <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                    Peso (kg)
                    {sugWeightsArr.some(Boolean) && (
                      <span className="block font-normal normal-case text-primary-400">
                        sug: {sugWeightsArr.filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Fila por serie */}
              {sets_arr.map((set, si) => (
                <div key={si} className={`grid grid-cols-${colCount} gap-1.5 mb-1.5 items-center`}>
                  <div className="text-xs text-center text-gray-400 font-medium">{si + 1}</div>
                  <input
                    className="input text-sm text-center py-1.5"
                    placeholder={String(sugRepsArr[si] || '—')}
                    value={set.reps || ''}
                    onChange={(e) => updateSet(i, si, 'reps', e.target.value)}
                  />
                  {needsWeight && (
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input text-sm text-center py-1.5"
                      placeholder={sugWeightsArr[si] || '0'}
                      value={set.weight_kg || ''}
                      onChange={(e) => updateSet(i, si, 'weight_kg', e.target.value)}
                    />
                  )}
                  {sets_arr.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSet(i, si)}
                      className="text-gray-300 hover:text-red-400 transition-colors flex justify-center"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => addSet(i)}
                className="text-xs text-primary-500 hover:text-primary-700 flex items-center gap-1 mt-0.5 transition-colors"
              >
                <Plus size={11} /> Agregar serie
              </button>
            </div>
          )
        })}

        <div>
          <label className="label">Notas</label>
          <textarea
            className="input resize-none text-sm"
            rows={2}
            placeholder="Condiciones del test, fatiga, pausas..."
            value={results.notes || ''}
            onChange={(e) => onChange({ ...results, notes: e.target.value })}
          />
        </div>
      </div>
    )
  }

  // Single exercise mode (free-form)
  const totalReps = parseInt(results.reps) || 0
  const weight = parseFloat(results.weight_kg) || 0
  const volume = needsWeight && totalReps && weight ? +(totalReps * weight).toFixed(1) : null

  return (
    <div className="space-y-5">
      <MethodBadge evalType="max_reps" methodKey={method} />

      <div className="grid grid-cols-1 gap-3">
        <NumInput
          label={needsTime ? 'Repeticiones completadas (en 60 seg)' : 'Repeticiones máximas'}
          placeholder="Ej: 25"
          value={results.reps || ''}
          onChange={(v) => onChange({ ...results, reps: v })}
        />
        {needsWeight && (
          <NumInput
            label="Peso utilizado"
            unit="kg"
            step="0.5"
            placeholder="Ej: 60"
            value={results.weight_kg || ''}
            onChange={(v) => onChange({ ...results, weight_kg: v })}
            hint="Requerido para calcular volumen"
          />
        )}
      </div>

      {totalReps > 0 && (
        <div className="grid gap-3">
          <ResultBox label="Repeticiones máximas" value={totalReps} unit="reps" />
          {volume !== null && (
            <ResultBox
              label="Volumen total"
              value={volume}
              unit="kg"
              sub={`${totalReps} reps × ${weight} kg`}
            />
          )}
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones del test, fatiga, pausas..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
