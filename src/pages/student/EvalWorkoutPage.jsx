import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  METHODS, FMS_PATTERNS,
  emptyResults, evalTypeLabel, evalTypeIcon,
  calc1RM, calcPower, calcVO2max, calcBodyComp, calcFMSScore,
} from '../../utils/evalHelpers'
import { ArrowLeft, Save, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react'

// ============================================================
// Shared: Method selector
// ============================================================
function MethodSelector({ evalType, value, onChange }) {
  const methods = METHODS[evalType] || []
  return (
    <div className="space-y-2">
      <label className="label">Método de evaluación</label>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {methods.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
              value === m.key
                ? 'bg-primary-600 text-white border-primary-600 shadow'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {methods.find(m => m.key === value)?.note && (
        <p className="text-xs text-gray-400">{methods.find(m => m.key === value).note}</p>
      )}
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
// FORM: 1RM
// ============================================================
function OneRMForm({ results, onChange }) {
  const method = results.method || 'brzycki'

  function updateExercise(i, field, value) {
    const exercises = [...(results.exercises || [])]
    exercises[i] = { ...exercises[i], [field]: value }
    // recalculate 1RM
    if (field === 'weight_kg' || field === 'reps') {
      const w = field === 'weight_kg' ? value : exercises[i].weight_kg
      const r = field === 'reps' ? value : exercises[i].reps
      exercises[i].one_rm = calc1RM(method, w, r)
    }
    onChange({ ...results, exercises })
  }

  function addExercise() {
    const ex = { name: '', weight_kg: '', reps: '', one_rm: null }
    onChange({ ...results, exercises: [...(results.exercises || []), ex] })
  }

  function removeExercise(i) {
    onChange({ ...results, exercises: results.exercises.filter((_, idx) => idx !== i) })
  }

  function changeMethod(m) {
    // Recalculate all exercises with new method
    const exercises = (results.exercises || []).map(ex => ({
      ...ex,
      one_rm: calc1RM(m, ex.weight_kg, ex.reps),
    }))
    onChange({ ...results, method: m, exercises })
  }

  return (
    <div className="space-y-5">
      <MethodSelector evalType="one_rm" value={method} onChange={changeMethod} />

      {(results.exercises || []).map((ex, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Ejercicio {i + 1}</span>
            {(results.exercises || []).length > 1 && (
              <button onClick={() => removeExercise(i)} className="ml-auto text-red-400 hover:text-red-600 p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <input
            className="input text-sm"
            placeholder="Nombre del ejercicio (ej: Sentadilla, Press banca...)"
            value={ex.name || ''}
            onChange={e => updateExercise(i, 'name', e.target.value)}
          />

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
        </div>
      ))}

      <button
        type="button"
        onClick={addExercise}
        className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
      >
        <Plus size={14} /> Agregar ejercicio
      </button>

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
function MaxRepsForm({ results, onChange }) {
  const method = results.method || 'pushup'
  const needsWeight = method === 'submax'
  const needsTime = method === 'situp'

  const totalReps = parseInt(results.reps) || 0
  const weight = parseFloat(results.weight_kg) || 0
  const volume = needsWeight && totalReps && weight ? +(totalReps * weight).toFixed(1) : null

  return (
    <div className="space-y-5">
      <MethodSelector evalType="max_reps" value={method} onChange={m => onChange({ ...results, method: m, reps: '', weight_kg: '', volume: null })} />

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
function PowerForm({ results, onChange }) {
  const method = results.method || 'harman'

  const computed = calcPower(method, {
    mass_kg: results.mass_kg,
    jump_cm: results.jump_cm,
    time_sec: results.time_sec,
    distance_m: results.distance_m,
  })

  const needsMass = ['lewis', 'harman'].includes(method)
  const needsJump = ['lewis', 'harman'].includes(method)
  const needsDist = ['broad_jump', 'sprint'].includes(method)
  const needsTime = method === 'sprint'

  return (
    <div className="space-y-5">
      <MethodSelector evalType="power" value={method} onChange={m => onChange({ ...results, method: m, result: null })} />

      <div className="grid grid-cols-2 gap-3">
        {needsMass && (
          <NumInput
            label="Masa corporal"
            unit="kg"
            step="0.1"
            placeholder="70"
            value={results.mass_kg || ''}
            onChange={v => onChange({ ...results, mass_kg: v })}
          />
        )}
        {needsJump && (
          <NumInput
            label="Altura de salto"
            unit="cm"
            step="0.5"
            placeholder="45"
            value={results.jump_cm || ''}
            onChange={v => onChange({ ...results, jump_cm: v })}
          />
        )}
        {needsDist && (
          <NumInput
            label="Distancia"
            unit="m"
            step="0.01"
            placeholder="Ej: 2.35"
            value={results.distance_m || ''}
            onChange={v => onChange({ ...results, distance_m: v })}
          />
        )}
        {needsTime && (
          <NumInput
            label="Tiempo"
            unit="seg"
            step="0.01"
            placeholder="Ej: 1.85"
            value={results.time_sec || ''}
            onChange={v => onChange({ ...results, time_sec: v })}
          />
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
function CardioForm({ results, onChange }) {
  const method = results.method || 'cooper'

  const vo2 = calcVO2max(method, results)

  return (
    <div className="space-y-5">
      <MethodSelector evalType="cardio" value={method} onChange={m => onChange({ ...results, method: m, vo2max: null })} />

      {method === 'cooper' && (
        <NumInput label="Distancia recorrida en 12 min" unit="m" placeholder="2800"
          value={results.distance_m || ''}
          onChange={v => onChange({ ...results, distance_m: v })}
          hint="Test Cooper clásico: correr 12 minutos y medir distancia"
        />
      )}

      {method === 'rockport' && (
        <div className="space-y-3">
          <SexSelector value={results.sex || 'male'} onChange={v => onChange({ ...results, sex: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Edad" unit="años" placeholder="30" value={results.age || ''} onChange={v => onChange({ ...results, age: v })} />
            <NumInput label="Peso corporal" unit="kg" step="0.1" placeholder="70" value={results.weight_kg || ''} onChange={v => onChange({ ...results, weight_kg: v })} />
            <NumInput label="Tiempo en caminar 1 milla" unit="min" step="0.01" placeholder="12.5" value={results.time_min || ''} onChange={v => onChange({ ...results, time_min: v })} hint="1 milla = 1609 m" />
            <NumInput label="FC al finalizar" unit="bpm" placeholder="150" value={results.heart_rate || ''} onChange={v => onChange({ ...results, heart_rate: v })} />
          </div>
        </div>
      )}

      {method === 'yoyo' && (
        <NumInput label="Nivel alcanzado (Yo-Yo Nivel 1)" placeholder="Ej: 16.3" value={results.yoyo_level || ''} onChange={v => onChange({ ...results, yoyo_level: v })} hint="Nivel en formato etapa.número (ej: 16.3)" />
      )}

      {method === 'beep' && (
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Nivel alcanzado" placeholder="Ej: 12" value={results.beep_level || ''} onChange={v => onChange({ ...results, beep_level: v })} />
          <NumInput label="Velocidad (km/h)" step="0.1" placeholder="12" value={results.beep_speed || ''} onChange={v => onChange({ ...results, beep_speed: v })} />
        </div>
      )}

      {method === 'harvard' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Pulso de recuperación: contar durante 30 seg y multiplicar × 2</p>
          <div className="grid grid-cols-3 gap-3">
            <NumInput label={`FC 1'–1'30"`} unit="bpm" placeholder="150" value={results.hr1 || ''} onChange={v => onChange({ ...results, hr1: v })} />
            <NumInput label={`FC 2'–2'30"`} unit="bpm" placeholder="130" value={results.hr2 || ''} onChange={v => onChange({ ...results, hr2: v })} />
            <NumInput label={`FC 3'–3'30"`} unit="bpm" placeholder="120" value={results.hr3 || ''} onChange={v => onChange({ ...results, hr3: v })} />
          </div>
          <NumInput label="Duración del test" unit="seg" placeholder="300" value={results.step_duration_sec || '300'} onChange={v => onChange({ ...results, step_duration_sec: v })} hint="Máx 300 seg (5 min)" />
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
function BodyCompForm({ results, onChange }) {
  const method = results.method || 'jp3'
  const sex = results.sex || 'male'

  const computed = calcBodyComp(method, results)

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

  function updateSkinfold(key, value) {
    onChange({ ...results, skinfolds: { ...results.skinfolds, [key]: value } })
  }
  function updatePerimeter(key, value) {
    onChange({ ...results, perimeters: { ...results.perimeters, [key]: value } })
  }

  return (
    <div className="space-y-5">
      <MethodSelector evalType="body_comp" value={method} onChange={m => onChange({ ...results, method: m, result: null })} />

      <SexSelector value={sex} onChange={v => onChange({ ...results, sex: v })} />

      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Edad" unit="años" placeholder="28" value={results.age || ''} onChange={v => onChange({ ...results, age: v })} />
        <NumInput label="Peso corporal" unit="kg" step="0.1" placeholder="70" value={results.weight_kg || ''} onChange={v => onChange({ ...results, weight_kg: v })} />
        {method === 'navy' && (
          <NumInput label="Talla" unit="cm" step="0.5" placeholder="175" value={results.height_cm || ''} onChange={v => onChange({ ...results, height_cm: v })} />
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
const SCORE_LABELS = ['0 – Dolor', '1 – No pasa', '2 – Compensado', '3 – Óptimo']

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

function ScoredForm({ results, onChange }) {
  const method = results.method || 'fms'

  function updateFMS(i, field, value) {
    const patterns = [...(results.fms_patterns || [])]
    patterns[i] = { ...patterns[i], [field]: value }
    const { total, asymmetries } = calcFMSScore(patterns)
    onChange({ ...results, fms_patterns: patterns, result: { total, asymmetries } })
  }

  const fmsTotal = results.result?.total

  return (
    <div className="space-y-5">
      <MethodSelector evalType="scored" value={method} onChange={m => onChange({ ...results, method: m, result: null })} />

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
function EvalForm({ evalType, results, onChange }) {
  switch (evalType) {
    case 'one_rm':    return <OneRMForm results={results} onChange={onChange} />
    case 'max_reps':  return <MaxRepsForm results={results} onChange={onChange} />
    case 'power':     return <PowerForm results={results} onChange={onChange} />
    case 'cardio':    return <CardioForm results={results} onChange={onChange} />
    case 'body_comp': return <BodyCompForm results={results} onChange={onChange} />
    case 'scored':    return <ScoredForm results={results} onChange={onChange} />
    case 'custom':    return <CustomForm results={results} onChange={onChange} />
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
      setResults(emptyResults(data.eval_type))

      const { data: existing } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('plan_id', planId)
        .eq('student_id', user.id)
        .eq('eval_date', new Date().toISOString().slice(0, 10))
        .single()

      if (existing) {
        setResults(existing.results)
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
            setResults(emptyResults(plan.eval_type))
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
