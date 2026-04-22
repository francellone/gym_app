import { useState } from 'react'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, Info, Clock, Flame, Trash2,
} from 'lucide-react'
import {
  CIRCUIT_TYPES, INTENSITY_LEVELS, blockDisplayTitle,
} from '../../utils/planHelpers'

/**
 * Card del bloque CIRCUITO para la vista del alumno.
 * Registra: duración real + rondas + detalle por ejercicio + RPE del bloque.
 */
export default function CircuitBlockRunCard({
  block, blockLog, exerciseLogs = {}, onSaveBlockLog, onSaveExerciseLog, onDeleteBlockLog,
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const completed = !!blockLog?.completed
  const circuitType = CIRCUIT_TYPES.find(t => t.key === block.circuit_type)
  const intensity = INTENSITY_LEVELS.find(i => i.key === block.circuit_intensity)

  const suggestedMinutes = block.circuit_total_minutes || (
    block.circuit_type === 'hiit' && block.circuit_rounds && block.circuit_work_seconds
      ? Math.ceil(((block.circuit_work_seconds + (block.circuit_rest_seconds || 0)) * block.circuit_rounds) / 60)
      : ''
  )

  // Estado del form del bloque
  const [form, setForm] = useState({
    actual_minutes: blockLog?.actual_minutes != null
      ? String(blockLog.actual_minutes)
      : (suggestedMinutes ? String(suggestedMinutes) : ''),
    actual_rounds: blockLog?.actual_rounds != null
      ? String(blockLog.actual_rounds)
      : (block.circuit_rounds ? String(block.circuit_rounds) : ''),
    perceived_difficulty: blockLog?.perceived_difficulty ?? null,
    notes: blockLog?.notes || '',
  })

  // Estado por ejercicio del circuito: { [planExerciseId]: { actual_reps, actual_weight, actual_time } }
  const [exForm, setExForm] = useState(() => {
    const init = {}
    for (const ex of (block.plan_exercises || [])) {
      const log = exerciseLogs[ex.id]
      init[ex.id] = {
        actual_reps: log?.actual_reps ?? '',
        actual_weight: log?.actual_weight != null ? String(log.actual_weight) : '',
        actual_time: log?.notes_runtime ?? '',  // placeholder
      }
    }
    return init
  })

  const title = blockDisplayTitle(block)

  async function saveBlock() {
    setSaving(true)
    try {
      await onSaveBlockLog({
        actual_minutes: form.actual_minutes ? parseFloat(form.actual_minutes) : null,
        actual_rounds: form.actual_rounds ? parseInt(form.actual_rounds) : null,
        perceived_difficulty: form.perceived_difficulty || null,
        notes: form.notes || null,
        completed: true,
      })
      // Guardar logs de ejercicios del circuito (si hay detalle cargado)
      for (const ex of (block.plan_exercises || [])) {
        const data = exForm[ex.id]
        if (!data) continue
        const isTime = ex.exercise_mode === 'time'
        const hasData = isTime ? !!data.actual_time : (!!data.actual_reps || !!data.actual_weight)
        if (hasData) {
          await onSaveExerciseLog(ex.id, {
            actual_sets: 1,
            actual_reps: data.actual_reps ? String(data.actual_reps) : null,
            actual_weight: data.actual_weight ? parseFloat(data.actual_weight) : null,
            notes: data.actual_time ? `Tiempo: ${data.actual_time}s` : null,
            completed: true,
          })
        }
      }
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await onDeleteBlockLog()
    setConfirmDelete(false)
    setEditing(false)
    setExpanded(false)
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <p className="font-semibold text-gray-900">¿Desmarcar circuito?</p>
            <p className="text-sm text-gray-600">Se borrará tu registro del bloque completo.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1 text-sm">
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-xl transition"
              >
                Sí, desmarcar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-2xl border-2 transition-all overflow-hidden ${
        completed ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'
      }`}>
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={e => { e.stopPropagation(); if (!completed) setEditing(true) }}
            className="flex-shrink-0"
          >
            {completed
              ? <CheckCircle2 size={24} className="text-orange-500" />
              : <Circle size={24} className="text-gray-300" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🔥</span>
              <p className={`font-semibold text-sm truncate ${completed ? 'text-orange-800' : 'text-gray-900'}`}>
                {title}
              </p>
              {circuitType && (
                <span className="badge bg-orange-100 text-orange-700 text-[10px] flex-shrink-0">
                  {circuitType.label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                (block.plan_exercises?.length || 0) > 0 && `${block.plan_exercises.length} ejercicios`,
                block.circuit_rounds && `${block.circuit_rounds} rondas`,
                block.circuit_total_minutes && `${block.circuit_total_minutes} min`,
                intensity?.label,
              ].filter(Boolean).join(' · ')}
            </p>
            {blockLog && !expanded && (
              <p className="text-xs text-orange-600 mt-0.5 font-medium">
                ✓ {[
                  blockLog.actual_minutes && `${blockLog.actual_minutes} min`,
                  blockLog.actual_rounds != null && `${blockLog.actual_rounds} rondas`,
                  blockLog.perceived_difficulty && `PSE ${blockLog.perceived_difficulty}`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {expanded
            ? <ChevronUp size={18} className="text-gray-400" />
            : <ChevronDown size={18} className="text-gray-400" />}
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Info del circuito */}
            <div className="bg-orange-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-orange-700 text-sm font-semibold">
                <Flame size={14} />
                {circuitType?.label || 'Circuito'}
              </div>
              {block.circuit_type === 'hiit' && (
                <div className="text-xs text-orange-700">
                  {block.circuit_rounds || '—'}× ({block.circuit_work_seconds || '—'}s trabajo / {block.circuit_rest_seconds || '—'}s descanso)
                </div>
              )}
              {(block.circuit_type === 'amrap' || block.circuit_type === 'emom') && block.circuit_total_minutes && (
                <div className="flex items-center gap-1 text-xs text-orange-700">
                  <Clock size={12} />
                  {block.circuit_total_minutes} minutos
                </div>
              )}
            </div>

            {/* Notas técnicas del coach */}
            {block.notes && (
              <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">{block.notes}</p>
              </div>
            )}

            {/* Lista de ejercicios */}
            {(block.plan_exercises || []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-700">Ejercicios</p>
                {(block.plan_exercises || []).map((ex, i) => (
                  <div key={ex.id} className="bg-white rounded-xl border border-gray-100 p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {i + 1}. {ex.exercise?.name || '—'}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {ex.exercise_mode === 'time'
                            ? `${ex.duration_seconds || '—'} seg`
                            : `${(ex.suggested_reps || '—')} reps`}
                        </p>
                      </div>
                    </div>

                    {/* Detalle editable */}
                    {(!completed || editing) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {ex.exercise_mode === 'time' ? (
                          <div className="col-span-2">
                            <label className="text-[10px] text-gray-500 mb-0.5 block">Tiempo real (s)</label>
                            <input
                              type="number" min="0" className="input text-sm"
                              placeholder={String(ex.duration_seconds || '')}
                              value={exForm[ex.id]?.actual_time || ''}
                              onChange={e => setExForm(p => ({
                                ...p,
                                [ex.id]: { ...(p[ex.id] || {}), actual_time: e.target.value },
                              }))}
                            />
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] text-gray-500 mb-0.5 block">Reps reales</label>
                              <input
                                className="input text-sm"
                                placeholder={ex.suggested_reps || ''}
                                value={exForm[ex.id]?.actual_reps || ''}
                                onChange={e => setExForm(p => ({
                                  ...p,
                                  [ex.id]: { ...(p[ex.id] || {}), actual_reps: e.target.value },
                                }))}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 mb-0.5 block">Peso (kg)</label>
                              <input
                                type="number" step="0.5" min="0" className="input text-sm"
                                placeholder={ex.suggested_weight || ''}
                                value={exForm[ex.id]?.actual_weight || ''}
                                onChange={e => setExForm(p => ({
                                  ...p,
                                  [ex.id]: { ...(p[ex.id] || {}), actual_weight: e.target.value },
                                }))}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Form del bloque */}
            {(!completed || editing) ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">Cierre del bloque</p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Duración real (min)</label>
                    <input
                      type="number" min="0" step="0.5" className="input text-sm"
                      placeholder={String(suggestedMinutes || '')}
                      value={form.actual_minutes}
                      onChange={e => setForm(p => ({ ...p, actual_minutes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Rondas completadas</label>
                    <input
                      type="number" min="0" className="input text-sm"
                      placeholder={String(block.circuit_rounds || '')}
                      value={form.actual_rounds}
                      onChange={e => setForm(p => ({ ...p, actual_rounds: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">PSE del bloque</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        onClick={() => setForm(p => ({ ...p, perceived_difficulty: p.perceived_difficulty === n ? null : n }))}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                          form.perceived_difficulty === n
                            ? (n >= 8 ? 'bg-red-500 text-white' : n >= 5 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white')
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Observaciones</label>
                  <textarea
                    className="input text-sm resize-none"
                    rows={2}
                    placeholder="¿Cómo fue el circuito?"
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={saveBlock}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><CheckCircle2 size={16} /> Marcar bloque completado</>
                  }
                </button>
              </div>
            ) : (
              <div className="bg-orange-100 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-orange-700">✓ Bloque completado</p>
                <p className="text-xs text-orange-700">
                  {[
                    blockLog?.actual_minutes && `${blockLog.actual_minutes} min`,
                    blockLog?.actual_rounds != null && `${blockLog.actual_rounds} rondas`,
                    blockLog?.perceived_difficulty && `PSE ${blockLog.perceived_difficulty}`,
                  ].filter(Boolean).join(' · ')}
                </p>
                {blockLog?.notes && <p className="text-xs text-orange-700 italic">"{blockLog.notes}"</p>}
                <div className="flex items-center gap-3 pt-0.5">
                  <button onClick={() => setEditing(true)} className="text-xs text-orange-700 underline">
                    Editar
                  </button>
                  <span className="text-orange-300 text-xs">·</span>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    Desmarcar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
