// ============================================================
// Registro libre — "Hoy hice esto" (v68)
// ------------------------------------------------------------
// La persona sin coach elige un ejercicio del catálogo (o crea uno), carga
// sus series y guarda. Cada registro es un workout_log común colgado del
// plan libre implícito, así Historial, Progreso y "lo de la última vez" lo
// ven sin cambios. Tocar un registro del día lo reabre para corregirlo.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import {
  ExerciseCatalogProvider,
  useExerciseCatalog,
  useExerciseCatalogData,
} from '@/features/exercises/ExerciseCatalogContext'
import ExercisePicker from '@/features/exercises/components/ExercisePicker'
import { exerciseDisplay } from '@/features/exercises/exercise-display'
import { WEIGHT_MODES_LOGGABLE, readLogReps, readLogWeights } from '@/features/plans/helpers'
import { postWorkoutLogNote } from '@/features/notes/api'
import {
  buildFreeLogArgs,
  ensureFreePlanExercise,
  fetchFreeLogs,
  fetchFreePlanId,
  fetchLastExerciseLog,
} from '../api'

const EMPTY_SET = { reps: '', weight: '' }

function setsFromLog(log) {
  const reps = readLogReps(log)
  const weights = readLogWeights(log)
  if (!reps.length) return [{ ...EMPTY_SET }, { ...EMPTY_SET }, { ...EMPTY_SET }]
  return reps.map((r, i) => ({
    reps: r == null ? '' : String(r),
    weight: weights[i] == null ? '' : String(weights[i]),
  }))
}

export default function FreeLogPage() {
  const catalog = useExerciseCatalogData()
  return (
    <ExerciseCatalogProvider catalog={catalog}>
      <FreeLogInner />
    </ExerciseCatalogProvider>
  )
}

function FreeLogInner() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { exercises } = useExerciseCatalog()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [planId, setPlanId] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | { logId, exerciseId }

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setError(null)
    try {
      const pid = await fetchFreePlanId(supabase, profile.id)
      setPlanId(pid)
      setLogs(await fetchFreeLogs(supabase, { studentId: profile.id, planId: pid, date }))
    } catch (err) {
      console.error('[FreeLogPage] load', err)
      setError(t('selfTraining.free.loadError'))
    } finally {
      setLoading(false)
    }
  }, [profile?.id, date, t])

  useEffect(() => {
    load()
  }, [load])

  const nameOf = (exerciseId) =>
    exerciseDisplay(
      exercises.find((e) => e.id === exerciseId),
      i18n.language
    ).name || t('history.exerciseFallback')

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-ghost p-2"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            {t('selfTraining.free.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('selfTraining.free.subtitle')}</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="free-log-date">
          {t('selfTraining.free.date')}
        </label>
        <input
          id="free-log-date"
          type="date"
          className="input"
          value={date}
          max={today}
          onChange={(e) => {
            setEditing(null)
            setDate(e.target.value || today)
          }}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {logs.length === 0 && !editing && (
            <p className="text-sm text-gray-500 text-center py-4">{t('selfTraining.free.empty')}</p>
          )}
          {logs.map((log) =>
            editing?.logId === log.id ? null : (
              <button
                key={log.id}
                type="button"
                onClick={() => setEditing({ logId: log.id, exerciseId: log.exercise_id, log })}
                className="card w-full flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 break-words">
                    {nameOf(log.exercise_id)}
                  </p>
                  <p className="text-xs text-gray-500">{summarize(log, t)}</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            )
          )}
        </div>
      )}

      {editing ? (
        <FreeLogForm
          key={editing.logId || 'new'}
          studentId={profile?.id}
          date={date}
          today={today}
          existing={editing.log || null}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ logId: null })}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Plus size={18} /> {t('selfTraining.free.addExercise')}
        </button>
      )}

      {planId === null && !loading && logs.length === 0 && (
        <p className="text-xs text-gray-400 text-center">{t('selfTraining.free.hint')}</p>
      )}
    </div>
  )
}

function summarize(log, t) {
  const reps = readLogReps(log).filter((r) => r != null && r !== '')
  const weights = readLogWeights(log).filter((w) => w != null && w !== '')
  const parts = [t('workout.series', { count: log.actual_sets || reps.length })]
  if (reps.length) parts.push(t('history.repsList', { reps: reps.join(',') }))
  if (weights.length) parts.push(t('workout.weightKg', { value: weights.join(',') }))
  if (log.weight_mode === 'bodyweight') parts.push('BW')
  return parts.join(' · ')
}

function FreeLogForm({ studentId, date, today, existing, onCancel, onSaved }) {
  const { t } = useTranslation()
  const { exercises } = useExerciseCatalog()
  const [exerciseId, setExerciseId] = useState(existing?.exercise_id || '')
  const [weightMode, setWeightMode] = useState(existing?.weight_mode || 'with_weight')
  const [sets, setSets] = useState(() =>
    existing ? setsFromLog(existing) : [{ ...EMPTY_SET }, { ...EMPTY_SET }, { ...EMPTY_SET }]
  )
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [prefilledFrom, setPrefilledFrom] = useState(null)

  // Al elegir un ejercicio nuevo: precargar lo de la última vez (o el modo
  // de peso por defecto del catálogo).
  async function pickExercise(id) {
    setExerciseId(id)
    setPrefilledFrom(null)
    if (!id || existing) return
    const ex = exercises.find((e) => e.id === id)
    const loggable = WEIGHT_MODES_LOGGABLE.some((m) => m.key === ex?.default_weight_mode)
    setWeightMode(loggable ? ex.default_weight_mode : 'with_weight')
    try {
      const last = await fetchLastExerciseLog(supabase, { studentId, exerciseId: id })
      if (last) {
        setSets(setsFromLog(last))
        if (WEIGHT_MODES_LOGGABLE.some((m) => m.key === last.weight_mode)) {
          setWeightMode(last.weight_mode)
        }
        setPrefilledFrom(last.logged_date)
      }
    } catch (err) {
      // Precargar es una ayuda; si falla se carga a mano.
      console.warn('[FreeLogForm] último registro', err)
    }
  }

  function updateSet(i, field, value) {
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)))
  }

  const hasReps = sets.some((s) => String(s.reps).trim() !== '')

  async function save() {
    if (!exerciseId) return setError(t('selfTraining.free.errorExercise'))
    if (!hasReps) return setError(t('selfTraining.free.errorReps'))
    setSaving(true)
    setError(null)
    try {
      const { planId, planExerciseId } = existing
        ? { planId: existing.plan_id, planExerciseId: existing.plan_exercise_id }
        : await ensureFreePlanExercise(supabase, exerciseId)
      const args = buildFreeLogArgs({
        studentId,
        planId,
        planExerciseId,
        date,
        today,
        weightMode,
        sets,
        logId: existing?.id || null,
      })
      const { data: logId, error: rpcErr } = await supabase.rpc('save_workout_log', args)
      if (rpcErr) throw rpcErr
      if (comment.trim()) {
        await postWorkoutLogNote({ studentId, logId, body: comment })
      }
      await onSaved()
    } catch (err) {
      console.error('[FreeLogForm] save', err)
      setError(t('selfTraining.free.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card space-y-4">
      {existing ? (
        <p className="text-sm font-semibold text-gray-900">
          {exercises.find((e) => e.id === exerciseId)?.name}
        </p>
      ) : (
        <ExercisePicker
          value={exerciseId}
          onChange={pickExercise}
          label={t('selfTraining.free.exercise')}
          size="md"
        />
      )}

      {prefilledFrom && (
        <p className="text-xs text-gray-500">
          {t('selfTraining.free.prefilled', { date: prefilledFrom })}
        </p>
      )}

      <div>
        <label className="label" htmlFor="free-weight-mode">
          {t('selfTraining.free.weightMode')}
        </label>
        <select
          id="free-weight-mode"
          className="input"
          value={weightMode}
          onChange={(e) => setWeightMode(e.target.value)}
        >
          {WEIGHT_MODES_LOGGABLE.map((m) => (
            <option key={m.key} value={m.key}>
              {t(`coach.planEditor.weightModes.${m.key}.label`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-xs text-gray-500 px-1">
          <span>#</span>
          <span>{t('selfTraining.free.reps')}</span>
          <span>{weightMode === 'bodyweight' ? '' : t('selfTraining.free.kg')}</span>
          <span />
        </div>
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center">
            <span className="text-sm text-gray-500 text-center">{i + 1}</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="input text-center"
              aria-label={t('selfTraining.free.repsOfSet', { n: i + 1 })}
              value={s.reps}
              onChange={(e) => updateSet(i, 'reps', e.target.value)}
            />
            {weightMode === 'bodyweight' ? (
              <span />
            ) : (
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                className="input text-center"
                aria-label={t('selfTraining.free.kgOfSet', { n: i + 1 })}
                value={s.weight}
                onChange={(e) => updateSet(i, 'weight', e.target.value)}
              />
            )}
            <button
              type="button"
              className="btn-ghost p-1.5 text-gray-400 disabled:opacity-30"
              disabled={sets.length === 1}
              aria-label={t('selfTraining.free.removeSet', { n: i + 1 })}
              onClick={() => setSets((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-sm text-primary-600 font-medium flex items-center gap-1"
          onClick={() => setSets((prev) => [...prev, { ...(prev[prev.length - 1] || EMPTY_SET) }])}
        >
          <Plus size={14} /> {t('selfTraining.free.addSet')}
        </button>
      </div>

      <div>
        <label className="label" htmlFor="free-comment">
          {t('selfTraining.free.comment')}
        </label>
        <textarea
          id="free-comment"
          className="input resize-none"
          rows={2}
          placeholder={t('selfTraining.free.commentPlaceholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {t('selfTraining.free.save')}
        </button>
      </div>
    </div>
  )
}
