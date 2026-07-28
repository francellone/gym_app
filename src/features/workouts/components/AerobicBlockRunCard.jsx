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
  Activity,
  Trash2,
  PlayCircle,
} from 'lucide-react'
import {
  AEROBIC_FORMATS,
  AEROBIC_INTERVAL_FORMATS,
  INTENSITY_LEVELS,
  AEROBIC_ZONES,
  blockDisplayTitle,
} from '@/features/plans/helpers'
import RPEScale from './RPEScale'
import { ExerciseHistoryHeaderLine, ExerciseHistoryBodyBlock } from './ExerciseHistoryPreview'
import { exerciseDisplay } from '@/features/exercises/exercise-display'

/**
 * Card del bloque AERÓBICO para la vista del alumno.
 * El alumno registra: duración real (min) + RPE + notas.
 *
 * Props Q1:
 *   lastBlockLog            workout_block_log | null
 *   previewNoteByExercise Map<exercise_id, note>
 *   noteCountByExercise     Map<exercise_id, number>
 *   onOpenChat              (exerciseId, exerciseName) => void
 *
 * El "ejercicio" del aerobic se toma de `block.plan_exercises[0]` (típicamente
 * el aerobic tiene un solo plan_exercise asociado: "Trote", "Bici", etc.).
 * Si no tiene plan_exercise, no se muestra preview del chat.
 */
export default function AerobicBlockRunCard({
  block,
  blockLog,
  onSaveLog,
  onDeleteLog,
  // Q1
  lastBlockLog = null,
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
  const [showDescription, setShowDescription] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const completed = !!blockLog?.completed
  const [form, setForm] = useState({
    actual_minutes:
      blockLog?.actual_minutes != null
        ? String(blockLog.actual_minutes)
        : block.aerobic_total_minutes
          ? String(block.aerobic_total_minutes)
          : '',
    perceived_difficulty: blockLog?.perceived_difficulty ?? null,
    notes: blockLog?.notes || '',
  })

  const format = AEROBIC_FORMATS.find((f) => f.key === block.aerobic_format)
  const intensity = INTENSITY_LEVELS.find((i) => i.key === block.aerobic_intensity)
  const zone = AEROBIC_ZONES.find((z) => z.key === block.aerobic_zone)
  const showIntervals = AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)

  const title = blockDisplayTitle(block)
  const firstPlanEx = block.plan_exercises?.[0]
  const exText = firstPlanEx?.exercise ? exerciseDisplay(firstPlanEx.exercise, i18n.language) : null
  const exerciseName = exText?.name
  const exerciseId = firstPlanEx?.exercise_id || null

  // Q1 — el preview "Última vez" usa el último block_log del bloque
  // (los datos de cardio viven a nivel block, no por exercise). El chat,
  // en cambio, usa exercise_id del primer plan_exercise.
  const noteCount = exerciseId ? noteCountByExercise?.get?.(exerciseId) || 0 : 0
  const previewNote = exerciseId ? previewNoteByExercise?.get?.(exerciseId) || null : null
  const handleOpenChat = () => {
    if (!exerciseId) return
    onOpenChat?.(exerciseId, exerciseName)
  }

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
            <p className="font-semibold text-gray-900">{t('workout.unmarkBlockTitle')}</p>
            <p className="text-sm text-gray-600">{t('workout.unmarkAerobicBody')}</p>
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
          completed ? 'border-sky-200 bg-sky-50' : 'border-gray-100 bg-white'
        }`}
      >
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
              <CheckCircle2 size={24} className="text-sky-500" />
            ) : (
              <Circle size={24} className="text-gray-300" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🏃</span>
              <p
                className={`font-semibold text-sm break-words ${completed ? 'text-sky-800' : 'text-gray-900'}`}
              >
                {title}
                {exerciseName && <span className="text-gray-400"> · {exerciseName}</span>}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                format && t(`workout.aerobicFormats.${format.key}`, { defaultValue: format.label }),
                block.aerobic_total_minutes &&
                  t('workout.minutesShort', { value: block.aerobic_total_minutes }),
                intensity &&
                  t(`workout.intensity.${intensity.key}`, { defaultValue: intensity.label }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {/* Q1 — "Última vez" del bloque + badge chat del ejercicio asociado */}
            <ExerciseHistoryHeaderLine
              lastBlockLog={lastBlockLog}
              noteCount={noteCount}
              onOpenChat={handleOpenChat}
            />
            {blockLog && !expanded && (
              <p className="text-xs text-sky-600 mt-0.5 font-medium">
                ✓{' '}
                {[
                  blockLog.actual_minutes &&
                    t('workout.minutesShort', { value: blockLog.actual_minutes }),
                  blockLog.perceived_difficulty &&
                    t('workout.pseValue', { value: blockLog.perceived_difficulty }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {exText?.description && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDescription((v) => !v)
                }}
                title={t('workout.exerciseInfo')}
                aria-label={t('workout.exerciseInfo')}
                aria-expanded={showDescription}
                className={`p-1.5 rounded-lg transition-colors ${
                  showDescription
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                <Info size={18} />
              </button>
            )}
            {firstPlanEx?.exercise?.video_url &&
              firstPlanEx.exercise.video_url.startsWith('http') && (
                <a
                  href={firstPlanEx.exercise.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                >
                  <PlayCircle size={18} />
                </a>
              )}
            {expanded ? (
              <ChevronUp size={18} className="text-gray-400" />
            ) : (
              <ChevronDown size={18} className="text-gray-400" />
            )}
          </div>
        </div>

        {/* Descripción (QUÉ es) del ejercicio aeróbico */}
        {showDescription && exText?.description && (
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-600 leading-relaxed">{exText.description}</p>
          </div>
        )}

        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            {/* Q1 — última nota del coach + ver chat completo del ejercicio */}
            {exerciseId && (
              <ExerciseHistoryBodyBlock
                previewNote={previewNote}
                noteCount={noteCount}
                onOpenChat={handleOpenChat}
              />
            )}

            {/* Ficha del bloque */}
            <div className="bg-sky-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sky-700 text-sm font-semibold">
                <Activity size={14} />
                {format
                  ? t(`workout.aerobicFormats.${format.key}`, { defaultValue: format.label })
                  : t('workout.aerobic')}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-sky-700">
                {block.aerobic_total_minutes && (
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {t('workout.minutesShort', { value: block.aerobic_total_minutes })}
                  </div>
                )}
                {zone && (
                  <div
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${zone.color} w-fit font-semibold`}
                  >
                    {zone.label} · {t(`workout.aerobicZones.${zone.key}.short`)}
                  </div>
                )}
                {intensity && !zone && (
                  <div
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${intensity.color} w-fit`}
                  >
                    {t(`workout.intensity.${intensity.key}`)}
                  </div>
                )}
              </div>
              {zone && (
                <div className="text-[11px] text-sky-700/90 pt-1 border-t border-sky-200 mt-1 leading-snug">
                  <span className="font-semibold">
                    {t('workout.zoneLabel', { zone: zone.label })}{' '}
                  </span>
                  {t(`workout.aerobicZones.${zone.key}.desc`)} ·{' '}
                  {t('workout.fcPct', { pct: zone.pct })}
                </div>
              )}
              {showIntervals &&
                (block.aerobic_work_seconds ||
                  block.aerobic_rest_seconds ||
                  block.aerobic_rounds) && (
                  <div className="text-xs text-sky-700 pt-1 border-t border-sky-200 mt-1">
                    {t('workout.workRestIntervals', {
                      rounds: block.aerobic_rounds || '—',
                      work: block.aerobic_work_seconds || '—',
                      rest: block.aerobic_rest_seconds || '—',
                    })}
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
            {!completed || editing ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">{t('workout.logBlock')}</p>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {t('workout.actualDurationMin')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="input text-sm"
                    placeholder={block.aerobic_total_minutes || '20'}
                    value={form.actual_minutes}
                    onChange={(e) => setForm((p) => ({ ...p, actual_minutes: e.target.value }))}
                  />
                </div>

                <RPEScale
                  variant="cardio"
                  label={t('workout.perceivedEffortTalkTest')}
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
                    placeholder={t('workout.howDidYouFeelPlaceholder')}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> {t('workout.markCompleted')}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-sky-100 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-sky-700">{t('workout.completedCheck')}</p>
                <p className="text-xs text-sky-700">
                  {[
                    blockLog?.actual_minutes &&
                      t('workout.minutesShort', { value: blockLog.actual_minutes }),
                    blockLog?.perceived_difficulty &&
                      t('workout.pseValue', { value: blockLog.perceived_difficulty }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {blockLog?.notes && (
                  <p className="text-xs text-sky-700 italic">"{blockLog.notes}"</p>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-sky-700 underline"
                  >
                    {t('workout.edit')}
                  </button>
                  <span className="text-sky-300 text-xs">·</span>
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
