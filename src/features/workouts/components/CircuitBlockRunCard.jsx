import { useState, useEffect } from 'react'
import { readExpanded, writeExpanded } from '../workoutViewState'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Flame,
  Trash2,
  PlayCircle,
} from 'lucide-react'
import {
  CIRCUIT_TYPES,
  INTENSITY_LEVELS,
  blockDisplayTitle,
  getEffectiveWeightMode,
  getLoggingWeightMode,
  getEffectivePct1rm,
  getEffectiveUnilateral,
  readLogReps,
  readLogWeights,
} from '@/features/plans/helpers'
import RPEScale from './RPEScale'
import { ExerciseHistoryHeaderLine, ExerciseHistoryBodyBlock } from './ExerciseHistoryPreview'
import { exerciseDisplay } from '@/features/exercises/exercise-display'

/**
 * Card del bloque CIRCUITO para la vista del alumno.
 * Registra: duración real + rondas + detalle por ejercicio + RPE del bloque.
 *
 * Props Q1:
 *   lastBlockLog            workout_block_log | null
 *   lastLogByExercise       Map<exercise_id, workout_log> — para los hijos
 *   previewNoteByExercise Map<exercise_id, note>
 *   noteCountByExercise     Map<exercise_id, number>
 *   onOpenChat              (exerciseId, exerciseName) => void
 *
 * Estrategia Q1 para circuit:
 *   - Header: "Última vez" del block_log (no por exercise, porque el
 *     circuit se entrena como bloque).
 *   - Body: por cada ejercicio del circuito, sumar línea compacta con
 *     "Última vez" del exercise + botón chat. Como son varios ejercicios
 *     dentro de un bloque, no agregamos el ExerciseHistoryBodyBlock
 *     completo por cada uno — eso satura. El alumno puede tocar el
 *     badge chat en la línea del ejercicio para abrir el drawer.
 */
export default function CircuitBlockRunCard({
  block,
  blockLog,
  exerciseLogs = {},
  onSaveBlockLog,
  onSaveExerciseLog,
  onDeleteBlockLog,
  // Q1
  lastBlockLog = null,
  lastLogByExercise,
  previewNoteByExercise,
  noteCountByExercise,
  onOpenChat,
  // viewstate — persistir bloque desplegado por día
  loggedDate = null,
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(() =>
    readExpanded({ blockId: block.id, loggedDate })
  )

  // Persistir/restaurar si el bloque quedó desplegado, para volver al mismo
  // lugar tras la recarga en frío al reabrir la app (scope por bloque + día).
  useEffect(() => {
    writeExpanded({ blockId: block.id, loggedDate, expanded })
  }, [block.id, loggedDate, expanded])
  // Qué ejercicios tienen su descripción abierta (por id de plan_exercise)
  const [openDesc, setOpenDesc] = useState({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const completed = !!blockLog?.completed
  const circuitType = CIRCUIT_TYPES.find((t) => t.key === block.circuit_type)
  const intensity = INTENSITY_LEVELS.find((i) => i.key === block.circuit_intensity)

  const suggestedMinutes =
    block.circuit_total_minutes ||
    (block.circuit_type === 'hiit' && block.circuit_rounds && block.circuit_work_seconds
      ? Math.ceil(
          ((block.circuit_work_seconds + (block.circuit_rest_seconds || 0)) *
            block.circuit_rounds) /
            60
        )
      : '')

  // Estado del form del bloque
  const [form, setForm] = useState({
    actual_minutes:
      blockLog?.actual_minutes != null
        ? String(blockLog.actual_minutes)
        : suggestedMinutes
          ? String(suggestedMinutes)
          : '',
    actual_rounds:
      blockLog?.actual_rounds != null
        ? String(blockLog.actual_rounds)
        : block.circuit_rounds
          ? String(block.circuit_rounds)
          : '',
    perceived_difficulty: blockLog?.perceived_difficulty ?? null,
    notes: blockLog?.notes || '',
  })

  // Estado por ejercicio del circuito: { [planExerciseId]: { actual_reps, actual_weight, actual_time } }
  // Los inputs son simples (1 valor por ejercicio en circuito, no por serie),
  // pero al guardar lo convertimos a jsonb array [n] para la RPC.
  const [exForm, setExForm] = useState(() => {
    const init = {}
    for (const ex of block.plan_exercises || []) {
      const log = exerciseLogs[ex.id]
      // Leer del jsonb si está, sino del legacy
      const repsArr = log ? readLogReps(log) : []
      const wArr = log ? readLogWeights(log) : []
      init[ex.id] = {
        actual_reps: repsArr.length > 0 ? String(repsArr[0]) : '',
        actual_weight: wArr.length > 0 && wArr[0] != null ? String(wArr[0]) : '',
        actual_time: log?.notes_runtime ?? '', // placeholder
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
      // Guardar logs de ejercicios del circuito (si hay detalle cargado).
      // Construimos el payload con el formato de la RPC save_workout_log:
      // p_reps / p_weights como jsonb array, p_weight_mode resuelto efectivo.
      for (const ex of block.plan_exercises || []) {
        const data = exForm[ex.id]
        if (!data) continue
        const isTime = ex.exercise_mode === 'time'
        const hasData = isTime ? !!data.actual_time : !!data.actual_reps || !!data.actual_weight
        if (!hasData) continue

        const weightMode = getLoggingWeightMode(
          getEffectiveWeightMode({
            planExercise: ex,
            exercise: ex.exercise,
          })
        )
        const unilateral = getEffectiveUnilateral({
          planExercise: ex,
          exercise: ex.exercise,
        })
        const repsNum =
          data.actual_reps !== '' && data.actual_reps != null ? parseFloat(data.actual_reps) : null
        const weightNum = !isNaN(parseFloat(data.actual_weight))
          ? parseFloat(data.actual_weight)
          : null

        // Round 2b (handoff m26→m27): la columna workout_logs.notes se dropeó.
        // No mandar `p_notes` a la RPC: el body del alumno (acá "Tiempo: 45s"
        // como anotación implícita para ejercicios time-based) va por
        // _noteBody y saveLog del padre lo redirige a postWorkoutLogNote.
        await onSaveExerciseLog(ex.id, {
          p_reps: repsNum != null ? [repsNum] : [],
          p_weights: weightMode === 'bodyweight' ? null : weightNum != null ? [weightNum] : [null],
          p_weight_mode: weightMode,
          p_unilateral: unilateral,
          p_reps_unit: null,
          p_actual_sets: 1,
          p_perceived_difficulty: null,
          p_perceived_difficulty_label: null,
          p_notes: null,
          p_completed: true,
          _noteBody: data.actual_time ? `Tiempo: ${data.actual_time}s` : '',
        })
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
            <p className="font-semibold text-gray-900">{t('workout.unmarkCircuitTitle')}</p>
            <p className="text-sm text-gray-600">{t('workout.unmarkCircuitBody')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-xl transition"
              >
                {t('workout.yesUnmark')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 transition-all overflow-hidden ${
          completed ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!completed) setEditing(true)
            }}
            className="flex-shrink-0"
          >
            {completed ? (
              <CheckCircle2 size={24} className="text-orange-500" />
            ) : (
              <Circle size={24} className="text-gray-300" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🔥</span>
              <p
                className={`font-semibold text-sm break-words ${completed ? 'text-orange-800' : 'text-gray-900'}`}
              >
                {title}
              </p>
              {circuitType && (
                <span className="badge bg-orange-100 text-orange-700 text-[10px] flex-shrink-0">
                  {t(`workout.circuitTypes.${circuitType.key}`)}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                (block.plan_exercises?.length || 0) > 0 &&
                  t('workout.exercisesCount', { count: block.plan_exercises.length }),
                block.circuit_rounds && t('workout.rounds', { count: block.circuit_rounds }),
                block.circuit_total_minutes &&
                  t('workout.minutesShort', { value: block.circuit_total_minutes }),
                intensity &&
                  t(`workout.intensity.${intensity.key}`, { defaultValue: intensity.label }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {/* Q1 — "Última vez" del bloque circuito (block-level) */}
            <ExerciseHistoryHeaderLine lastBlockLog={lastBlockLog} noteCount={0} />
            {blockLog && !expanded && (
              <p className="text-xs text-orange-600 mt-0.5 font-medium">
                ✓{' '}
                {[
                  blockLog.actual_minutes &&
                    t('workout.minutesShort', { value: blockLog.actual_minutes }),
                  blockLog.actual_rounds != null &&
                    t('workout.rounds', { count: blockLog.actual_rounds }),
                  blockLog.perceived_difficulty &&
                    t('workout.pseValue', { value: blockLog.perceived_difficulty }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          {expanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Info del circuito */}
            <div className="bg-orange-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-orange-700 text-sm font-semibold">
                <Flame size={14} />
                {circuitType
                  ? t(`workout.circuitTypes.${circuitType.key}`, {
                      defaultValue: circuitType.label,
                    })
                  : t('workout.circuit')}
              </div>
              {block.circuit_type === 'hiit' && (
                <div className="text-xs text-orange-700">
                  {t('workout.workRestIntervals', {
                    rounds: block.circuit_rounds || '—',
                    work: block.circuit_work_seconds || '—',
                    rest: block.circuit_rest_seconds || '—',
                  })}
                </div>
              )}
              {(block.circuit_type === 'amrap' || block.circuit_type === 'emom') &&
                block.circuit_total_minutes && (
                  <div className="flex items-center gap-1 text-xs text-orange-700">
                    <Clock size={12} />
                    {t('workout.minutes', { count: block.circuit_total_minutes })}
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
                <p className="text-xs font-semibold text-gray-700">{t('workout.exercisesTitle')}</p>
                {(block.plan_exercises || []).map((ex, i) => {
                  const exWeightMode = getEffectiveWeightMode({
                    planExercise: ex,
                    exercise: ex.exercise,
                  })
                  const exUnilateral = getEffectiveUnilateral({
                    planExercise: ex,
                    exercise: ex.exercise,
                  })
                  const exText = exerciseDisplay(ex.exercise, i18n.language)
                  // %RM prescripto: propio del ejercicio o el default del circuito.
                  const exPct1rm =
                    exWeightMode === 'pct_1rm'
                      ? getEffectivePct1rm({ planExercise: ex, block })
                      : null
                  const showWeight = exWeightMode !== 'bodyweight'
                  const repsLabel = exUnilateral
                    ? t('workout.repsPerSideHeader')
                    : t('workout.actualReps')
                  const exLastLog = lastLogByExercise?.get?.(ex.exercise_id) || null
                  const exNoteCount = noteCountByExercise?.get?.(ex.exercise_id) || 0
                  return (
                    <div key={ex.id} className="bg-white rounded-xl border border-gray-100 p-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 break-words">
                            {i + 1}. {exText.name || '—'}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {ex.exercise_mode === 'time'
                              ? t('workout.secondsShort', { value: ex.duration_seconds || '—' })
                              : `${ex.suggested_reps || '—'} ${exUnilateral ? t('workout.repsPerSideLower') : t('workout.repsLower')}`}
                            {exWeightMode === 'bodyweight' && ` · ${t('workout.noWeight')}`}
                            {exWeightMode === 'barbell_only' &&
                              ` · ${t('workout.barbellOnlyShort')}`}
                            {exPct1rm ? ` · ${exPct1rm}% ${t('workout.ofYourMax')}` : ''}
                          </p>
                          {/* Q1 — "Última vez" del ejercicio + badge chat */}
                          <ExerciseHistoryHeaderLine
                            lastLog={exLastLog}
                            noteCount={exNoteCount}
                            onOpenChat={() => onOpenChat?.(ex.exercise_id, ex.exercise?.name)}
                            isCompact
                          />
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {exText.description && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDesc((p) => ({ ...p, [ex.id]: !p[ex.id] }))
                              }}
                              title={t('workout.exerciseInfo')}
                              aria-label={t('workout.exerciseInfo')}
                              aria-expanded={!!openDesc[ex.id]}
                              className={`p-1.5 rounded-lg transition-colors ${
                                openDesc[ex.id]
                                  ? 'text-indigo-600 bg-indigo-50'
                                  : 'text-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              <Info size={18} />
                            </button>
                          )}
                          {ex.exercise?.video_url && ex.exercise.video_url.startsWith('http') && (
                            <a
                              href={ex.exercise.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                            >
                              <PlayCircle size={18} />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Descripción (QUÉ es) del ejercicio del circuito */}
                      {openDesc[ex.id] && exText.description && (
                        <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2">
                          <p className="text-[11px] text-gray-600 leading-relaxed">
                            {exText.description}
                          </p>
                        </div>
                      )}

                      {/* Detalle editable */}
                      {(!completed || editing) && (
                        <div
                          className={`grid gap-2 mt-2 ${showWeight && ex.exercise_mode !== 'time' ? 'grid-cols-2' : 'grid-cols-1'}`}
                        >
                          {ex.exercise_mode === 'time' ? (
                            <div>
                              <label className="text-[10px] text-gray-500 mb-0.5 block">
                                {t('workout.actualTimeSeconds')}
                              </label>
                              <input
                                type="number"
                                min="0"
                                className="input text-sm"
                                placeholder={String(ex.duration_seconds || '')}
                                value={exForm[ex.id]?.actual_time || ''}
                                onChange={(e) =>
                                  setExForm((p) => ({
                                    ...p,
                                    [ex.id]: { ...(p[ex.id] || {}), actual_time: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="text-[10px] text-gray-500 mb-0.5 block">
                                  {repsLabel}
                                </label>
                                <input
                                  className="input text-sm"
                                  placeholder={ex.suggested_reps || ''}
                                  value={exForm[ex.id]?.actual_reps || ''}
                                  onChange={(e) =>
                                    setExForm((p) => ({
                                      ...p,
                                      [ex.id]: { ...(p[ex.id] || {}), actual_reps: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              {showWeight && (
                                <div>
                                  <label className="text-[10px] text-gray-500 mb-0.5 block">
                                    {t('workout.weightKgHeader')}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    className="input text-sm"
                                    placeholder={ex.suggested_weight || ''}
                                    value={exForm[ex.id]?.actual_weight || ''}
                                    onChange={(e) =>
                                      setExForm((p) => ({
                                        ...p,
                                        [ex.id]: {
                                          ...(p[ex.id] || {}),
                                          actual_weight: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Form del bloque */}
            {!completed || editing ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">{t('workout.blockClosure')}</p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      {t('workout.actualDurationMin')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="input text-sm"
                      placeholder={String(suggestedMinutes || '')}
                      value={form.actual_minutes}
                      onChange={(e) => setForm((p) => ({ ...p, actual_minutes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      {t('workout.roundsCompleted')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input text-sm"
                      placeholder={String(block.circuit_rounds || '')}
                      value={form.actual_rounds}
                      onChange={(e) => setForm((p) => ({ ...p, actual_rounds: e.target.value }))}
                    />
                  </div>
                </div>

                <RPEScale
                  variant="circuit"
                  label={t('workout.blockPse')}
                  value={form.perceived_difficulty}
                  onChange={(n) => setForm((p) => ({ ...p, perceived_difficulty: n }))}
                />

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {t('workout.observations')}
                  </label>
                  <textarea
                    className="input text-sm resize-none"
                    rows={2}
                    placeholder={t('workout.howWasCircuitPlaceholder')}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={saveBlock}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> {t('workout.markBlockCompleted')}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-orange-100 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-orange-700">
                  {t('workout.blockCompletedCheck')}
                </p>
                <p className="text-xs text-orange-700">
                  {[
                    blockLog?.actual_minutes &&
                      t('workout.minutesShort', { value: blockLog.actual_minutes }),
                    blockLog?.actual_rounds != null &&
                      t('workout.rounds', { count: blockLog.actual_rounds }),
                    blockLog?.perceived_difficulty &&
                      t('workout.pseValue', { value: blockLog.perceived_difficulty }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {blockLog?.notes && (
                  <p className="text-xs text-orange-700 italic">"{blockLog.notes}"</p>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-orange-700 underline"
                  >
                    {t('workout.edit')}
                  </button>
                  <span className="text-orange-300 text-xs">·</span>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    {t('workout.unmark')}
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
