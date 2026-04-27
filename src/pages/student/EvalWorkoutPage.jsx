import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  METHODS, FMS_PATTERNS,
  emptyResults, evalTypeLabel, evalTypeIcon,
  calc1RM, calcPower, calcVO2max, calcBodyComp, calcFMSScore,
} from '../../utils/evalHelpers'
import { ArrowLeft, Save, Plus, Trash2, AlertCircle, CheckCircle, Lock, PlayCircle } from 'lucide-react'
import { parseReps } from '../../utils/planHelpers'

// ============================================================
// Shared: Method badge (locked by coach, not selectable)
// ============================================================
function MethodBadge({ evalType, methodKey }) {
  const methods = METHODS[evalType] || []
  const m = methods.find(x => x.key === methodKey)
  if (!m) return null
  return (
    <div className="flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-xl p-3">
      <Lock size={14} className="text-purple-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-semibold text-purple-700">
          Método: {m.label}
        </p>
        {m.note && <p className="text-xs text-purple-500 mt-0.5">{m.note}</p>}
      </div>
    </div>
  )
}

// Shared: Result box
function ResultBox({ label, value, unit, sub }) {
  if (value === null || value === undefined) return null
  return (
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
      <p className="text-xs text-primary-600 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-primary-700">
        {value} <span className="text-base font-medium">{unit}</span>
      </p>
      {sub && <p className="text-xs text-primary-500 mt-1">{sub}</p>}
    </div>
  )
}

function NumInput({ label, value, onChange, placeholder, step = '1', unit, hint }) {
  return (
    <div>
      <label className="label text-xs">
        {label}
        {unit && <span className="text-gray-400 font-normal ml-1">({unit})</span>}
      </label>
      <input
        type="number"
        step={step}
        className="input text-sm"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function SexSelector({ value, onChange }) {
  return (
    <div>
      <label className="label text-xs">Sexo</label>
      <div className="flex gap-2">
        {[['male', 'Masculino'], ['female', 'Femenino']].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
              value === k
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Helpers de pesos/reps sugeridos por el coach (igual lógica que TodayWorkoutPage)
// ============================================================
function parseSuggestedWeightVal(val) {
  if (!val || val === 'None' || val === 'none') return ''
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? '' : String(n)
}

function buildSuggestedWeightsArr(pe, setsCount) {
  const legacy = parseSuggestedWeightVal(pe.suggested_weight)
  if (pe.suggested_weights) {
    try {
      const parsed = JSON.parse(pe.suggested_weights)
      if (Array.isArray(parsed)) {
        return Array.from({ length: setsCount || parsed.length }, (_, i) =>
          parsed[i] != null ? String(parsed[i]) : ''
        )
      }
    } catch {}
    const val = parseSuggestedWeightVal(pe.suggested_weights)
    return Array.from({ length: setsCount || 1 }, () => val)
  }
  return Array.from({ length: setsCount || 1 }, () => legacy)
}

// Construir sets_arr vacío para un plan_exercise dado
function buildInitialSetsArr(pe, evalType) {
  const setsCount = parseInt(pe.suggested_sets) || 1
  const sugWeightsArr = buildSuggestedWeightsArr(pe, setsCount)
  const sugRepsArr = parseReps(pe.suggested_reps)
  return Array.from({ length: setsCount }, (_, i) => ({
    weight_kg: sugWeightsArr[i] || '',
    reps: String(sugRepsArr[i] || ''),
    ...(evalType === 'one_rm' ? { one_rm: null } : {}),
  }))
}

// ============================================================
// FORM: 1RM
// ============================================================
function OneRMForm({ results, onChange, planMethod, planExercises }) {
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
      w && r && parseFloat(w) > 0 && parseInt(r) > 0
        ? calc1RM(method, w, r)
        : null

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
    exercises[exIdx] = { ...ex, sets_arr: [...(ex.sets_arr || []), { weight_kg: '', reps: '', one_rm: null }] }
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
        const sets_arr = ex.sets_arr || [{ weight_kg: ex.weight_kg || '', reps: ex.reps || '', one_rm: ex.one_rm || null }]

        return (
          <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
            {/* Header: nombre + video */}
            <div className="flex items-center gap-2">
              <span className={`font-semibold truncate ${usePlanExercises ? 'text-sm text-gray-900' : 'text-xs text-gray-500'}`}>
                {ex.name || `Ejercicio ${i + 1}`}
              </span>
              {ex.video_url && ex.video_url.startsWith('http') && (
                <a
                  href={ex.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                  title="Ver video del ejercicio"
                >
                  <PlayCircle size={16} />
                </a>
              )}
              {!usePlanExercises && (results.exercises || []).length > 1 && (
                <button onClick={() => removeExercise(i)} className="ml-auto text-red-400 hover:text-red-600 p-1 flex-shrink-0">
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
                onChange={e => updateExercise(i, 'name', e.target.value)}
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
                  <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">1RM</div>
                </div>

                {/* Fila por serie */}
                {sets_arr.map((set, si) => (
                  <div key={si} className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] gap-1.5 mb-1.5 items-center">
                    <div className="text-xs text-center text-gray-400 font-medium">{si + 1}</div>
                    <input
                      className="input text-sm text-center py-1.5"
                      placeholder={String(sugRepsArr[si] || '—')}
                      value={set.reps || ''}
                      onChange={e => updateSet(i, si, 'reps', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input text-sm text-center py-1.5"
                      placeholder={sugWeightsArr[si] || '0'}
                      value={set.weight_kg || ''}
                      onChange={e => updateSet(i, si, 'weight_kg', e.target.value)}
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
                {(ex.best_one_rm != null || sets_arr.some(s => s.one_rm != null)) && (
                  <ResultBox
                    label={`Mejor 1RM estimado (${method})`}
                    value={ex.best_one_rm ?? sets_arr.reduce((m, s) => s.one_rm != null && s.one_rm > (m ?? 0) ? s.one_rm : m, null)}
                    unit="kg"
                    sub={`${sets_arr.filter(s => s.one_rm != null).length} intento(s) calculado(s)`}
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
                    onChange={v => updateExercise(i, 'weight_kg', v)}
                  />
                  <NumInput
                    label="Repeticiones"
                    placeholder="6"
                    value={ex.reps || ''}
                    onChange={v => updateExercise(i, 'reps', v)}
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
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Max Reps
// ============================================================
function MaxRepsForm({ results, onChange, planMethod, planExercises }) {
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

    const colCount = needsWeight
      ? '[1.5rem_1fr_1fr]'
      : '[1.5rem_1fr]'

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
                <p className="text-sm font-semibold text-gray-800 truncate">{ex.name || `Ejercicio ${i + 1}`}</p>
                {ex.video_url && ex.video_url.startsWith('http') && (
                  <a
                    href={ex.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                    title="Ver video del ejercicio"
                  >
                    <PlayCircle size={16} />
                  </a>
                )}
              </div>

              {pe?.notes && (
                <p className="text-xs text-blue-600 italic">📝 {pe.notes}</p>
              )}

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
                    onChange={e => updateSet(i, si, 'reps', e.target.value)}
                  />
                  {needsWeight && (
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input text-sm text-center py-1.5"
                      placeholder={sugWeightsArr[si] || '0'}
                      value={set.weight_kg || ''}
                      onChange={e => updateSet(i, si, 'weight_kg', e.target.value)}
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
            onChange={e => onChange({ ...results, notes: e.target.value })}
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
          onChange={v => onChange({ ...results, reps: v })}
        />
        {needsWeight && (
          <NumInput
            label="Peso utilizado"
            unit="kg"
            step="0.5"
            placeholder="Ej: 60"
            value={results.weight_kg || ''}
            onChange={v => onChange({ ...results, weight_kg: v })}
            hint="Requerido para calcular volumen"
          />
        )}
      </div>

      {totalReps > 0 && (
        <div className="grid gap-3">
          <ResultBox label="Repeticiones máximas" value={totalReps} unit="reps" />
          {volume !== null && (
            <ResultBox label="Volumen total" value={volume} unit="kg" sub={`${totalReps} reps × ${weight} kg`} />
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
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Power
// ============================================================
function PowerForm({ results, onChange, planMethod }) {
  const method = planMethod || results.method || 'harman'

  const computed = calcPower(method, {
    mass_kg: results.mass_kg,
    jump_cm: results.jump_cm,
    time_sec: results.time_sec,
    distance_m: results.distance_m,
  })

  // Store computed result in results JSONB on every change
  function update(field, value) {
    const updated = { ...results, method, [field]: value }
    const c = calcPower(method, {
      mass_kg: updated.mass_kg,
      jump_cm: updated.jump_cm,
      time_sec: updated.time_sec,
      distance_m: updated.distance_m,
    })
    onChange({ ...updated, result: c || null })
  }

  const needsMass = ['lewis', 'harman'].includes(method)
  const needsJump = ['lewis', 'harman'].includes(method)
  const needsDist = ['broad_jump', 'sprint'].includes(method)
  const needsTime = method === 'sprint'

  return (
    <div className="space-y-5">
      <MethodBadge evalType="power" methodKey={method} />

      <div className="grid grid-cols-2 gap-3">
        {needsMass && (
          <NumInput label="Masa corporal" unit="kg" step="0.1" placeholder="70"
            value={results.mass_kg || ''} onChange={v => update('mass_kg', v)} />
        )}
        {needsJump && (
          <NumInput label="Altura de salto" unit="cm" step="0.5" placeholder="45"
            value={results.jump_cm || ''} onChange={v => update('jump_cm', v)} />
        )}
        {needsDist && (
          <NumInput label="Distancia" unit="m" step="0.01" placeholder="Ej: 2.35"
            value={results.distance_m || ''} onChange={v => update('distance_m', v)} />
        )}
        {needsTime && (
          <NumInput label="Tiempo" unit="seg" step="0.01" placeholder="Ej: 1.85"
            value={results.time_sec || ''} onChange={v => update('time_sec', v)} />
        )}
      </div>

      {computed && (
        <div className="space-y-3">
          {computed.power_w !== undefined && (
            <ResultBox label="Potencia media (Lewis)" value={computed.power_w} unit="W" />
          )}
          {computed.peak_w !== undefined && (
            <ResultBox label="Potencia pico (Harman)" value={computed.peak_w} unit="W" sub={`Potencia media: ${computed.mean_w} W`} />
          )}
          {computed.distance_m !== undefined && method === 'broad_jump' && (
            <ResultBox label="Distancia horizontal" value={computed.distance_m} unit="m" />
          )}
          {computed.time_sec !== undefined && method === 'sprint' && (
            <ResultBox label="Tiempo en pista" value={computed.time_sec} unit="seg" sub={`Velocidad media: ${computed.speed_ms} m/s`} />
          )}
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Tipo de superficie, calzado, intentos..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Cardio
// ============================================================
function CardioForm({ results, onChange, planMethod }) {
  const method = planMethod || results.method || 'cooper'

  function update(patch) {
    const updated = { ...results, method, ...patch }
    const vo2 = calcVO2max(method, updated)
    onChange({ ...updated, vo2max: vo2 })
  }

  const vo2 = calcVO2max(method, results)

  return (
    <div className="space-y-5">
      <MethodBadge evalType="cardio" methodKey={method} />

      {method === 'cooper' && (
        <NumInput label="Distancia recorrida en 12 min" unit="m" placeholder="2800"
          value={results.distance_m || ''}
          onChange={v => update({ distance_m: v })}
          hint="Test Cooper clásico: correr 12 minutos y medir distancia"
        />
      )}

      {method === 'rockport' && (
        <div className="space-y-3">
          <SexSelector value={results.sex || 'male'} onChange={v => update({ sex: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Edad" unit="años" placeholder="30" value={results.age || ''} onChange={v => update({ age: v })} />
            <NumInput label="Peso corporal" unit="kg" step="0.1" placeholder="70" value={results.weight_kg || ''} onChange={v => update({ weight_kg: v })} />
            <NumInput label="Tiempo en caminar 1 milla" unit="min" step="0.01" placeholder="12.5" value={results.time_min || ''} onChange={v => update({ time_min: v })} hint="1 milla = 1609 m" />
            <NumInput label="FC al finalizar" unit="bpm" placeholder="150" value={results.heart_rate || ''} onChange={v => update({ heart_rate: v })} />
          </div>
        </div>
      )}

      {method === 'yoyo' && (
        <NumInput label="Nivel alcanzado (Yo-Yo Nivel 1)" placeholder="Ej: 16.3" value={results.yoyo_level || ''} onChange={v => update({ yoyo_level: v })} hint="Nivel en formato etapa.número (ej: 16.3)" />
      )}

      {method === 'beep' && (
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Nivel alcanzado" placeholder="Ej: 12" value={results.beep_level || ''} onChange={v => update({ beep_level: v })} />
          <NumInput label="Velocidad (km/h)" step="0.1" placeholder="12" value={results.beep_speed || ''} onChange={v => update({ beep_speed: v })} />
        </div>
      )}

      {method === 'harvard' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Pulso de recuperación: contar durante 30 seg y multiplicar × 2</p>
          <div className="grid grid-cols-3 gap-3">
            <NumInput label={`FC 1'-1'30"`} unit="bpm" placeholder="150" value={results.hr1 || ''} onChange={v => update({ hr1: v })} />
            <NumInput label={`FC 2'-2'30"`} unit="bpm" placeholder="130" value={results.hr2 || ''} onChange={v => update({ hr2: v })} />
            <NumInput label={`FC 3'-3'30"`} unit="bpm" placeholder="120" value={results.hr3 || ''} onChange={v => update({ hr3: v })} />
          </div>
          <NumInput label="Duración del test" unit="seg" placeholder="300" value={results.step_duration_sec || '300'} onChange={v => update({ step_duration_sec: v })} hint="Máx 300 seg (5 min)" />
        </div>
      )}

      {vo2 !== null && (
        <ResultBox
          label={method === 'harvard' ? 'Índice Físico (PFI)' : 'VO₂max estimado'}
          value={vo2}
          unit={method === 'harvard' ? 'pts' : 'ml/kg/min'}
          sub={method === 'harvard'
            ? vo2 < 55 ? 'Aceptable' : vo2 < 70 ? 'Bueno' : 'Excelente'
            : vo2 < 30 ? 'Muy bajo' : vo2 < 40 ? 'Regular' : vo2 < 50 ? 'Bueno' : vo2 < 60 ? 'Muy bueno' : 'Superior'
          }
        />
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones del test, temperatura, sensaciones..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Body Composition
// ============================================================
function BodyCompForm({ results, onChange, planMethod }) {
  const method = planMethod || results.method || 'jp3'
  const sex = results.sex || 'male'

  const skinfoldFields = {
    jp3: sex === 'male'
      ? [['chest','Pectoral'],['abdomen','Abdominal'],['thigh','Muslo']]
      : [['triceps','Tríceps'],['suprailiac','Suprailiaco'],['thigh','Muslo']],
    jp7: [['chest','Pectoral'],['abdomen','Abdominal'],['thigh','Muslo'],['triceps','Tríceps'],['subscapular','Subescapular'],['suprailiac','Suprailiaco'],['midaxillary','Midaxilar']],
    dw:  [['biceps','Bíceps'],['triceps','Tríceps'],['subscapular','Subescapular'],['suprailiac','Suprailiaco']],
    navy: [],
  }

  const perimeterFields = {
    navy: sex === 'male'
      ? [['neck','Cuello'],['waist','Cintura']]
      : [['neck','Cuello'],['waist','Cintura'],['hip','Cadera']],
    jp3: [], jp7: [], dw: [],
  }

  const sFields = skinfoldFields[method] || []
  const pFields = perimeterFields[method] || []

  function update(patch) {
    const updated = { ...results, method, ...patch }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  function updateSkinfold(key, value) {
    const updated = { ...results, method, skinfolds: { ...results.skinfolds, [key]: value } }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  function updatePerimeter(key, value) {
    const updated = { ...results, method, perimeters: { ...results.perimeters, [key]: value } }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  const computed = calcBodyComp(method, results)

  return (
    <div className="space-y-5">
      <MethodBadge evalType="body_comp" methodKey={method} />

      <SexSelector value={sex} onChange={v => update({ sex: v })} />

      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Edad" unit="años" placeholder="28" value={results.age || ''} onChange={v => update({ age: v })} />
        <NumInput label="Peso corporal" unit="kg" step="0.1" placeholder="70" value={results.weight_kg || ''} onChange={v => update({ weight_kg: v })} />
        {method === 'navy' && (
          <NumInput label="Talla" unit="cm" step="0.5" placeholder="175" value={results.height_cm || ''} onChange={v => update({ height_cm: v })} />
        )}
      </div>

      {sFields.length > 0 && (
        <div>
          <label className="label">Pliegues cutáneos (mm)</label>
          <div className="grid grid-cols-2 gap-2">
            {sFields.map(([key, label]) => (
              <NumInput key={key} label={label} unit="mm" step="0.1" placeholder="0"
                value={results.skinfolds?.[key] || ''}
                onChange={v => updateSkinfold(key, v)}
              />
            ))}
          </div>
        </div>
      )}

      {pFields.length > 0 && (
        <div>
          <label className="label">Perímetros (cm)</label>
          <div className="grid grid-cols-2 gap-2">
            {pFields.map(([key, label]) => (
              <NumInput key={key} label={label} unit="cm" step="0.1" placeholder="0"
                value={results.perimeters?.[key] || ''}
                onChange={v => updatePerimeter(key, v)}
              />
            ))}
          </div>
        </div>
      )}

      {computed && (
        <div className="space-y-3">
          <ResultBox label="% Grasa corporal" value={computed.fat_pct} unit="%" />
          {computed.fat_kg !== null && (
            <div className="grid grid-cols-2 gap-3">
              <ResultBox label="Masa grasa" value={computed.fat_kg} unit="kg" />
              <ResultBox label="Masa magra" value={computed.lean_kg} unit="kg" />
            </div>
          )}
          {computed.sum_mm && (
            <p className="text-xs text-gray-400 text-center">Suma pliegues: {computed.sum_mm} mm</p>
          )}
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones, equipo utilizado..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Scored / Funcional
// ============================================================
const SCORES = [0, 1, 2, 3]
const SCORE_COLORS = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500']

function ScoreButton({ value, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 rounded-xl text-sm font-bold transition-all border-2 ${
        selected
          ? `${SCORE_COLORS[value]} text-white border-transparent shadow`
          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
      }`}
    >
      {value}
    </button>
  )
}

function ScoredForm({ results, onChange, planMethod }) {
  const method = planMethod || results.method || 'fms'

  function updateFMS(i, field, value) {
    const patterns = [...(results.fms_patterns || [])]
    patterns[i] = { ...patterns[i], [field]: value }
    const { total, asymmetries } = calcFMSScore(patterns)
    onChange({ ...results, method, fms_patterns: patterns, result: { total, asymmetries } })
  }

  const fmsTotal = results.result?.total

  return (
    <div className="space-y-5">
      <MethodBadge evalType="scored" methodKey={method} />

      {method === 'fms' && (
        <div className="space-y-4">
          {(results.fms_patterns || FMS_PATTERNS.map(p => ({ ...p, score: null, score_left: null, score_right: null, pain: false, notes: '' }))).map((p, i) => (
            <div key={p.key} className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 flex-1">{p.label}</p>
                <button
                  type="button"
                  onClick={() => updateFMS(i, 'pain', !p.pain)}
                  className={`text-xs px-2 py-1 rounded-lg font-medium transition-all ${
                    p.pain ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-white text-gray-400 border border-gray-200'
                  }`}
                >
                  {p.pain ? '⚠️ Dolor' : 'Sin dolor'}
                </button>
              </div>

              {p.bilateral ? (
                <div className="grid grid-cols-2 gap-4">
                  {[['score_left', '← Izquierda'], ['score_right', 'Derecha →']].map(([field, lbl]) => (
                    <div key={field}>
                      <p className="text-xs text-gray-500 mb-2">{lbl}</p>
                      <div className="flex gap-1.5">
                        {SCORES.map(s => (
                          <ScoreButton
                            key={s}
                            value={s}
                            selected={p[field] === s}
                            onClick={() => updateFMS(i, field, p[field] === s ? null : s)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Puntuación</p>
                  <div className="flex gap-1.5">
                    {SCORES.map(s => (
                      <ScoreButton
                        key={s}
                        value={s}
                        selected={p.score === s}
                        onClick={() => updateFMS(i, 'score', p.score === s ? null : s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <input
                className="input text-xs"
                placeholder="Observaciones de este patrón..."
                value={p.notes || ''}
                onChange={e => updateFMS(i, 'notes', e.target.value)}
              />
            </div>
          ))}

          {fmsTotal !== undefined && fmsTotal !== null && (
            <ResultBox
              label="Puntaje FMS Total"
              value={fmsTotal}
              unit="/ 21"
              sub={fmsTotal < 14
                ? '⚠️ Riesgo de lesión — score < 14'
                : results.result?.asymmetries?.length > 0
                  ? `Asimetrías detectadas en: ${results.result.asymmetries.join(', ')}`
                  : '✅ Score dentro del rango aceptable'
              }
            />
          )}
        </div>
      )}

      {method === 'sit_reach' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Distancia desde la línea de los pies. Positivo = más allá de los pies.</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Mejor intento" unit="cm" step="0.5" placeholder="Ej: 12"
              value={results.distance_left_cm || ''} onChange={v => onChange({ ...results, distance_left_cm: v })} />
            <NumInput label="Segundo intento" unit="cm" step="0.5" placeholder="Ej: 10"
              value={results.distance_right_cm || ''} onChange={v => onChange({ ...results, distance_right_cm: v })} />
          </div>
          {results.distance_left_cm && (
            <ResultBox label="Flexibilidad isquiosural" value={results.distance_left_cm} unit="cm" />
          )}
        </div>
      )}

      {method === 'shoulder_mob' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Distancia entre ambas manos detrás de la espalda. Menor = mejor movilidad.</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Mano derecha arriba" unit="cm" step="0.5" placeholder="Ej: 5"
              value={results.distance_left_cm || ''} onChange={v => onChange({ ...results, distance_left_cm: v })} />
            <NumInput label="Mano izquierda arriba" unit="cm" step="0.5" placeholder="Ej: 8"
              value={results.distance_right_cm || ''} onChange={v => onChange({ ...results, distance_right_cm: v })} />
          </div>
          {results.distance_left_cm && results.distance_right_cm && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
              {Math.abs(parseFloat(results.distance_left_cm) - parseFloat(results.distance_right_cm)) > 1.5
                ? '⚠️ Asimetría detectada (diferencia > 1.5 cm)'
                : '✅ Simetría dentro del rango normal'
              }
            </div>
          )}
        </div>
      )}

      {method === 'y_balance' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">3 vectores de alcance en apoyo monopodal (cm). Normalizar dividiendo por largo de pierna.</p>
          {[
            ['reach_anterior', 'Vector Anterior'],
            ['reach_posteromedial', 'Vector Posteromedial'],
            ['reach_posterolateral', 'Vector Posterolateral'],
          ].map(([field, label]) => (
            <div key={field}>
              <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Izquierda" unit="cm" step="0.5" placeholder="0"
                  value={results[`${field}_l`] || ''} onChange={v => onChange({ ...results, [`${field}_l`]: v })} />
                <NumInput label="Derecha" unit="cm" step="0.5" placeholder="0"
                  value={results[`${field}_r`] || ''} onChange={v => onChange({ ...results, [`${field}_r`]: v })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label">Notas generales</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Observaciones de la evaluación..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// FORM: Custom
// ============================================================
function CustomForm({ results, onChange }) {
  function updateField(i, key, value) {
    const fields = [...(results.fields || [])]
    fields[i] = { ...fields[i], [key]: value }
    onChange({ ...results, fields })
  }

  return (
    <div className="space-y-3">
      {(results.fields || []).map((f, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">#{i + 1}</span>
            {i > 0 && (
              <button
                onClick={() => onChange({ ...results, fields: results.fields.filter((_, idx) => idx !== i) })}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <input className="input text-sm" placeholder="Nombre del campo (ej: Sentadilla)"
            value={f.label || ''} onChange={e => updateField(i, 'label', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Valor (ej: 100)"
              value={f.value || ''} onChange={e => updateField(i, 'value', e.target.value)} />
            <input className="input text-sm" placeholder="Unidad (ej: kg, cm, min)"
              value={f.unit || ''} onChange={e => updateField(i, 'unit', e.target.value)} />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...results, fields: [...(results.fields || []), { label: '', value: '', unit: '' }] })}
        className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
      >
        <Plus size={14} /> Agregar campo
      </button>
      <div>
        <label className="label">Notas</label>
        <textarea className="input resize-none text-sm" rows={2}
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ============================================================
// Dispatcher
// ============================================================
function EvalForm({ evalType, results, onChange, planMethod, planExercises }) {
  const props = { results, onChange, planMethod, planExercises }
  switch (evalType) {
    case 'one_rm':    return <OneRMForm {...props} />
    case 'max_reps':  return <MaxRepsForm {...props} />
    case 'power':     return <PowerForm {...props} />
    case 'cardio':    return <CardioForm {...props} />
    case 'body_comp': return <BodyCompForm {...props} />
    case 'scored':    return <ScoredForm {...props} />
    case 'custom':    return <CustomForm {...props} />
    default:          return <p className="text-sm text-gray-400">Tipo de evaluación no reconocido.</p>
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

  const [evalDate, setEvalDate] = useState(new Date().toISOString().slice(0, 10))
  const [results, setResults] = useState(null)
  const [notes, setNotes] = useState('')

  useEffect(() => { fetchPlan() }, [planId])

  async function fetchPlan() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single()
      if (error) throw error
      setPlan(data)

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
        initResults.exercises = planEx.map(pe => ({
          exercise_id: pe.exercise_id,
          name: pe.exercises?.name || 'Ejercicio',
          video_url: pe.exercises?.video_url || null,
          sets_arr: buildInitialSetsArr(pe, data.eval_type),
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
        .single()

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
                enriched.sets_arr = [{
                  weight_kg: ex.weight_kg || '',
                  reps: ex.reps || '',
                  ...(data.eval_type === 'one_rm' ? { one_rm: ex.one_rm || null } : {}),
                }]
              }
              return enriched
            }),
          }
        }
        setResults(loadedResults)
        setNotes(existing.notes || '')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('evaluation_results')
        .upsert({
          student_id: user.id,
          plan_id: planId,
          eval_date: evalDate,
          eval_type: plan.eval_type,
          results,
          notes,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'student_id,plan_id,eval_date' })
      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!plan) return <div className="text-center py-12 text-gray-500">Evaluación no encontrada</div>
  if (!results) return null

  return (
    <div className="space-y-5 max-w-2xl">
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
          onChange={e => {
            setEvalDate(e.target.value)
            const initResults = emptyResults(plan.eval_type, plan.eval_method || '')
            if (planExercises.length > 0) {
              initResults.exercises = planExercises.map(pe => ({
                exercise_id: pe.exercise_id,
                name: pe.exercises?.name || 'Ejercicio',
                video_url: pe.exercises?.video_url || null,
                sets_arr: buildInitialSetsArr(pe, plan.eval_type),
                best_one_rm: null,
                weight_kg: '',
                reps: '',
                one_rm: null,
              }))
            }
            setResults(initResults)
          }}
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
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl p-3 text-sm">
          <CheckCircle size={16} />
          <span>¡Evaluación guardada!</span>
        </div>
      )}

      <div className="pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Save size={16} /> Guardar evaluación</>
          }
        </button>
      </div>
    </div>
  )
}
