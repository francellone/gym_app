import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  MOVEMENT_SCREEN_PATTERNS, SCREEN_SCORES,
  ROM_ZONES, SKINFOLD_SITES,
  emptyResults, evalTypeLabel, evalTypeIcon,
} from '../../utils/evalHelpers'
import { ArrowLeft, Save, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react'

// ============================================================
// Sub-forms per eval_type
// ============================================================

// ---- Movement Screen form ---------------------------------
function MovementScreenForm({ results, onChange }) {
  function setScore(patternKey, criterionKey, side, value) {
    const next = { ...results }
    next.patterns = next.patterns.map(p => {
      if (p.key !== patternKey) return p
      return {
        ...p,
        criteria: {
          ...p.criteria,
          [criterionKey]: {
            ...p.criteria[criterionKey],
            [side]: value,
          },
        },
      }
    })
    onChange(next)
  }

  function setPatternObs(patternKey, value) {
    const next = { ...results }
    next.patterns = next.patterns.map(p =>
      p.key === patternKey ? { ...p, obs: value } : p
    )
    onChange(next)
  }

  return (
    <div className="space-y-6">
      {MOVEMENT_SCREEN_PATTERNS.map(pattern => {
        const data = results.patterns?.find(p => p.key === pattern.key)
        if (!data) return null
        return (
          <div key={pattern.key} className="space-y-3">
            <h3 className="font-semibold text-gray-900">{pattern.label}</h3>
            {pattern.criteria.map(c => (
              <div key={c.key} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">{c.label}</p>
                <div className="grid grid-cols-2 gap-3">
                  {['left', 'right'].map(side => (
                    <div key={side}>
                      <p className="text-xs text-gray-500 mb-1.5">{side === 'left' ? '← Izquierda' : 'Derecha →'}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {SCREEN_SCORES.map(s => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => setScore(pattern.key, c.key, side, data.criteria?.[c.key]?.[side] === s.value ? null : s.value)}
                            className={`text-xs py-1.5 rounded-lg font-medium transition-all ${
                              data.criteria?.[c.key]?.[side] === s.value
                                ? s.color
                                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <input
              className="input text-sm"
              placeholder="Observaciones del patrón..."
              value={data.obs || ''}
              onChange={e => setPatternObs(pattern.key, e.target.value)}
            />
          </div>
        )
      })}
      <div>
        <label className="label">Observaciones generales</label>
        <textarea
          className="input resize-none text-sm"
          rows={3}
          placeholder="Notas generales de la sesión..."
          value={results.general_notes || ''}
          onChange={e => onChange({ ...results, general_notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Strength / AMRAP form --------------------------------
function StrengthAmrapForm({ results, onChange }) {
  function updateExercise(i, field, value) {
    const next = { ...results }
    next.exercises = [...(next.exercises || [])]
    next.exercises[i] = { ...next.exercises[i], [field]: value }
    onChange(next)
  }

  function addExercise() {
    onChange({ ...results, exercises: [...(results.exercises || []), { name: '', reps: '', weight: '', notes: '' }] })
  }

  function removeExercise(i) {
    const next = { ...results }
    next.exercises = next.exercises.filter((_, idx) => idx !== i)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {(results.exercises || []).map((ex, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">#{i + 1}</span>
            <button onClick={() => removeExercise(i)} className="ml-auto text-red-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
          <input
            className="input text-sm"
            placeholder="Ejercicio (ej: Dominadas, Press banca...)"
            value={ex.name || ''}
            onChange={e => updateExercise(i, 'name', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Reps max</label>
              <input
                type="number"
                className="input text-sm"
                placeholder="Ej: 12"
                value={ex.reps || ''}
                onChange={e => updateExercise(i, 'reps', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Peso (kg)</label>
              <input
                type="number"
                step="0.5"
                className="input text-sm"
                placeholder="Ej: 70"
                value={ex.weight || ''}
                onChange={e => updateExercise(i, 'weight', e.target.value)}
              />
            </div>
          </div>
          <input
            className="input text-sm"
            placeholder="Observaciones..."
            value={ex.notes || ''}
            onChange={e => updateExercise(i, 'notes', e.target.value)}
          />
        </div>
      ))}
      <button type="button" onClick={addExercise} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
        <Plus size={14} />
        Agregar ejercicio
      </button>
      <div>
        <label className="label">Notas generales</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Observaciones de la sesión..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Flexibility / ROM form -------------------------------
function FlexibilityRomForm({ results, onChange }) {
  function updateMeasurement(i, field, value) {
    const next = { ...results }
    next.measurements = [...(next.measurements || [])]
    next.measurements[i] = { ...next.measurements[i], [field]: value }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {(results.measurements || []).map((m, i) => {
        const zone = ROM_ZONES.find(z => z.key === m.zone)
        return (
          <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">{zone?.label || m.zone}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Izquierda (°)</label>
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="0"
                  value={m.left_deg || ''}
                  onChange={e => updateMeasurement(i, 'left_deg', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Derecha (°)</label>
                <input
                  type="number"
                  className="input text-sm"
                  placeholder="0"
                  value={m.right_deg || ''}
                  onChange={e => updateMeasurement(i, 'right_deg', e.target.value)}
                />
              </div>
            </div>
            <input
              className="input text-sm"
              placeholder="Observaciones..."
              value={m.notes || ''}
              onChange={e => updateMeasurement(i, 'notes', e.target.value)}
            />
          </div>
        )
      })}
      <div>
        <label className="label">Notas generales</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Jump form --------------------------------------------
function JumpForm({ results, onChange }) {
  function updateAttempt(i, field, value) {
    const next = { ...results }
    next.attempts = [...(next.attempts || [])]
    next.attempts[i] = { ...next.attempts[i], [field]: value }
    onChange(next)
  }

  function addAttempt() {
    onChange({ ...results, attempts: [...(results.attempts || []), { cm: '', notes: '' }] })
  }

  function removeAttempt(i) {
    onChange({ ...results, attempts: results.attempts.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-4">
      {(results.attempts || []).map((a, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">Intento {i + 1}</p>
            {i > 0 && (
              <button onClick={() => removeAttempt(i)} className="ml-auto text-red-400">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500">Altura (cm)</label>
            <input
              type="number"
              step="0.5"
              className="input text-sm"
              placeholder="Ej: 42"
              value={a.cm || ''}
              onChange={e => updateAttempt(i, 'cm', e.target.value)}
            />
          </div>
          <input
            className="input text-sm"
            placeholder="Observaciones..."
            value={a.notes || ''}
            onChange={e => updateAttempt(i, 'notes', e.target.value)}
          />
        </div>
      ))}
      <button type="button" onClick={addAttempt} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
        <Plus size={14} />
        Agregar intento
      </button>
      <div>
        <label className="label">Notas de técnica</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Observaciones sobre la técnica..."
          value={results.technique_notes || ''}
          onChange={e => onChange({ ...results, technique_notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Cooper form ------------------------------------------
function CooperForm({ results, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Distancia recorrida (metros)</label>
        <input
          type="number"
          className="input"
          placeholder="Ej: 2800"
          value={results.distance_m || ''}
          onChange={e => onChange({ ...results, distance_m: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">Test de 12 minutos · distancia total en metros</p>
      </div>
      <div>
        <label className="label">Frecuencia cardíaca final (bpm)</label>
        <input
          type="number"
          className="input"
          placeholder="Ej: 178"
          value={results.heart_rate_end || ''}
          onChange={e => onChange({ ...results, heart_rate_end: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={3}
          placeholder="Condiciones del test, sensaciones..."
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Body Composition form --------------------------------
function BodyCompForm({ results, onChange }) {
  function setSkinfold(key, value) {
    onChange({ ...results, skinfolds: { ...results.skinfolds, [key]: value } })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label text-xs">Peso (kg)</label>
          <input type="number" step="0.1" className="input text-sm" placeholder="70"
            value={results.weight_kg || ''}
            onChange={e => onChange({ ...results, weight_kg: e.target.value })}
          />
        </div>
        <div>
          <label className="label text-xs">% Grasa</label>
          <input type="number" step="0.1" className="input text-sm" placeholder="15"
            value={results.body_fat_pct || ''}
            onChange={e => onChange({ ...results, body_fat_pct: e.target.value })}
          />
        </div>
        <div>
          <label className="label text-xs">Masa musc. (kg)</label>
          <input type="number" step="0.1" className="input text-sm" placeholder="55"
            value={results.muscle_mass_kg || ''}
            onChange={e => onChange({ ...results, muscle_mass_kg: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label">Pliegues cutáneos (mm)</label>
        <div className="grid grid-cols-2 gap-2">
          {SKINFOLD_SITES.map(s => (
            <div key={s.key}>
              <label className="text-xs text-gray-500">{s.label}</label>
              <input
                type="number"
                step="0.1"
                className="input text-sm"
                placeholder="0"
                value={results.skinfolds?.[s.key] || ''}
                onChange={e => setSkinfold(s.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          value={results.notes || ''}
          onChange={e => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}

// ---- Custom form ------------------------------------------
function CustomForm({ results, onChange }) {
  function updateField(i, key, value) {
    const next = { ...results }
    next.fields = [...(next.fields || [])]
    next.fields[i] = { ...next.fields[i], [key]: value }
    onChange(next)
  }

  function addField() {
    onChange({ ...results, fields: [...(results.fields || []), { label: '', value: '', unit: '' }] })
  }

  function removeField(i) {
    onChange({ ...results, fields: results.fields.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-3">
      {(results.fields || []).map((f, i) => (
        <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">#{i + 1}</span>
            {i > 0 && (
              <button onClick={() => removeField(i)} className="ml-auto text-red-400">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm col-span-2" placeholder="Nombre del campo (ej: Sentadilla)"
              value={f.label || ''} onChange={e => updateField(i, 'label', e.target.value)} />
            <input className="input text-sm" placeholder="Valor (ej: 100)"
              value={f.value || ''} onChange={e => updateField(i, 'value', e.target.value)} />
            <input className="input text-sm" placeholder="Unidad (ej: kg)"
              value={f.unit || ''} onChange={e => updateField(i, 'unit', e.target.value)} />
          </div>
        </div>
      ))}
      <button type="button" onClick={addField} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
        <Plus size={14} />
        Agregar campo
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

// ---- Dispatcher -------------------------------------------
function EvalForm({ evalType, results, onChange }) {
  switch (evalType) {
    case 'movement_screen': return <MovementScreenForm results={results} onChange={onChange} />
    case 'strength_amrap': return <StrengthAmrapForm results={results} onChange={onChange} />
    case 'flexibility_rom': return <FlexibilityRomForm results={results} onChange={onChange} />
    case 'jump': return <JumpForm results={results} onChange={onChange} />
    case 'cardio_cooper': return <CooperForm results={results} onChange={onChange} />
    case 'body_comp': return <BodyCompForm results={results} onChange={onChange} />
    case 'custom': return <CustomForm results={results} onChange={onChange} />
    default: return <p className="text-sm text-gray-400">Tipo de evaluación no reconocido.</p>
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

      // Load existing result for today if any
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
          onChange={e => setEvalDate(e.target.value)}
        />
      </div>

      {/* Eval form */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Registro de evaluación</h2>
        <EvalForm
          evalType={plan.eval_type}
          results={results}
          onChange={setResults}
        />
      </div>

      {/* General notes */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Observaciones finales</h2>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="¿Cómo te sentiste? Algún dato adicional para el coach..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Errors / success */}
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

      {/* Save button */}
      <div className="pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><Save size={16} /> Guardar evaluación</>
          )}
        </button>
      </div>
    </div>
  )
}
