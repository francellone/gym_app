import { useState } from 'react'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, Info, Clock, Activity, Trash2,
} from 'lucide-react'
import {
  AEROBIC_FORMATS, AEROBIC_INTERVAL_FORMATS, INTENSITY_LEVELS, blockDisplayTitle,
} from '../../utils/planHelpers'

/**
 * Card del bloque AERÓBICO para la vista del alumno.
 * El alumno registra: duración real (min) + RPE + notas.
 */
export default function AerobicBlockRunCard({
  block, blockLog, onSaveLog, onDeleteLog,
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const completed = !!blockLog?.completed
  const [form, setForm] = useState({
    actual_minutes: blockLog?.actual_minutes != null ? String(blockLog.actual_minutes) : (block.aerobic_total_minutes ? String(block.aerobic_total_minutes) : ''),
    perceived_difficulty: blockLog?.perceived_difficulty ?? null,
    notes: blockLog?.notes || '',
  })

  const format = AEROBIC_FORMATS.find(f => f.key === block.aerobic_format)
  const intensity = INTENSITY_LEVELS.find(i => i.key === block.aerobic_intensity)
  const showIntervals = AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)

  const title = blockDisplayTitle(block)
  const exerciseName = block.plan_exercises?.[0]?.exercise?.name

  async function save() {
    setSaving(true)
    try {
      await onSaveLog({
        actual_minutes: form.actual_minutes ? parseFloat(form.actual_minutes) : null,
        perceived_difficulty: form.perceived_difficulty || null,
        notes: form.notes || null,
        completed: true,
      })
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await onDeleteLog()
    setForm({
      actual_minutes: block.aerobic_total_minutes ? String(block.aerobic_total_minutes) : '',
      perceived_difficulty: null,
      notes: '',
    })
    setConfirmDelete(false)
    setEditing(false)
    setExpanded(false)
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <p className="font-semibold text-gray-900">¿Desmarcar bloque?</p>
            <p className="text-sm text-gray-600">Se borrará tu registro de este bloque aeróbico.</p>
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
        completed ? 'border-sky-200 bg-sky-50' : 'border-gray-100 bg-white'
      }`}>
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={e => { e.stopPropagation(); if (!completed) setEditing(true) }}
            className="flex-shrink-0"
          >
            {completed
              ? <CheckCircle2 size={24} className="text-sky-500" />
              : <Circle size={24} className="text-gray-300" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🏃</span>
              <p className={`font-semibold text-sm truncate ${completed ? 'text-sky-800' : 'text-gray-900'}`}>
                {title}
                {exerciseName && <span className="text-gray-400"> · {exerciseName}</span>}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                format?.label,
                block.aerobic_total_minutes && `${block.aerobic_total_minutes} min`,
                intensity?.label,
              ].filter(Boolean).join(' · ')}
            </p>
            {blockLog && !expanded && (
              <p className="text-xs text-sky-600 mt-0.5 font-medium">
                ✓ {[
                  blockLog.actual_minutes && `${blockLog.actual_minutes} min`,
                  blockLog.perceived_difficulty && `PSE ${blockLog.perceived_difficulty}`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {expanded
            ? <ChevronUp size={18} className="text-gray-400" />
            : <ChevronDown size={18} className="text-gray-400" />}
        </div>

        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Ficha del bloque */}
            <div className="bg-sky-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-sm font-semibold">
                <Activity size={14} />
                {format?.label || 'Aeróbico'}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-sky-700">
                {block.aerobic_total_minutes && (
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {block.aerobic_total_minutes} min
                  </div>
                )}
                {intensity && (
                  <div className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${intensity.color} w-fit`}>
                    {intensity.label}
                  </div>
                )}
              </div>
              {showIntervals && (block.aerobic_work_seconds || block.aerobic_rest_seconds || block.aerobic_rounds) && (
                <div className="text-xs text-sky-700 pt-1 border-t border-sky-200 mt-1">
                  {block.aerobic_rounds || '—'}× ({block.aerobic_work_seconds || '—'}s trabajo / {block.aerobic_rest_seconds || '—'}s descanso)
                </div>
              )}
              {block.aerobic_expected_sensation && (
                <div className="text-xs text-sky-700 italic pt-1 border-t border-sky-200 mt-1">
                  "{block.aerobic_expected_sensation}"
                </div>
              )}
            </div>

            {block.notes && (
              <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">{block.notes}</p>
              </div>
            )}

            {/* Formulario */}
            {(!completed || editing) ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">Registrar bloque</p>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Duración real (min)</label>
                  <input
                    type="number" min="0" step="0.5" className="input text-sm"
                    placeholder={block.aerobic_total_minutes || '20'}
                    value={form.actual_minutes}
                    onChange={e => setForm(p => ({ ...p, actual_minutes: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Esfuerzo percibido (PSE)</label>
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
                    placeholder="¿Cómo te sentiste?"
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><CheckCircle2 size={16} /> Marcar como completado</>
                  }
                </button>
              </div>
            ) : (
              <div className="bg-sky-100 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-sky-700">✓ Completado</p>
                <p className="text-xs text-sky-700">
                  {[
                    blockLog?.actual_minutes && `${blockLog.actual_minutes} min`,
                    blockLog?.perceived_difficulty && `PSE ${blockLog.perceived_difficulty}`,
                  ].filter(Boolean).join(' · ')}
                </p>
                {blockLog?.notes && <p className="text-xs text-sky-700 italic">"{blockLog.notes}"</p>}
                <div className="flex items-center gap-3 pt-0.5">
                  <button onClick={() => setEditing(true)} className="text-xs text-sky-700 underline">
                    Editar
                  </button>
                  <span className="text-sky-300 text-xs">·</span>
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
