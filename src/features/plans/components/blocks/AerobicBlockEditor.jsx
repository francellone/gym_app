import {
  AEROBIC_FORMATS,
  AEROBIC_INTERVAL_FORMATS,
  INTENSITY_LEVELS,
  AEROBIC_ZONES,
} from '../../helpers'
import { useTranslation } from 'react-i18next'
import ExercisePicker from '@/features/exercises/components/ExercisePicker'

/**
 * Editor del bloque AERÓBICO.
 * Campos: ejercicio (opcional desde dropdown filtrable por tag), formato,
 * duración total, intensidad y — si es intervalos/HIIT — work/rest/rondas.
 */
export default function AerobicBlockEditor({ block, onUpdate, onUpdateExercises }) {
  const { t } = useTranslation()
  const showIntervals = AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)

  // El bloque aeróbico admite 1 ejercicio opcional (ej: "Cinta" o "Bicicleta").
  const currentExerciseId = block.exercises?.[0]?.exercise_id || ''

  function handleExerciseChange(exerciseId) {
    if (!exerciseId) {
      onUpdateExercises([])
      return
    }
    const existing = block.exercises?.[0]
    const next = {
      ...(existing || {}),
      exercise_id: exerciseId,
      exercise_mode: 'time',
      order_index: 0,
    }
    onUpdateExercises([next])
  }

  return (
    <div className="space-y-3">
      {/* Ejercicio (opcional) */}
      <ExercisePicker
        value={currentExerciseId}
        onChange={(id) => handleExerciseChange(id)}
        label={t('coach.planEditor.aerobicBlock.exerciseLabel')}
        placeholder={t('coach.planEditor.aerobicBlock.exercisePlaceholder')}
      />

      {/* Formato */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          {t('coach.planEditor.aerobicBlock.format')}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {AEROBIC_FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onUpdate({ aerobic_format: f.key })}
              className={`rounded-xl border-2 p-2 text-left transition-all ${
                block.aerobic_format === f.key
                  ? 'border-sky-500 bg-sky-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p
                className={`text-xs font-semibold ${block.aerobic_format === f.key ? 'text-sky-700' : 'text-gray-700'}`}
              >
                {t(`workout.aerobicFormats.${f.key}`)}
              </p>
              <p className="text-[10px] text-gray-400 leading-tight">
                {t(`coach.planEditor.aerobicBlock.formatDesc.${f.key}`)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Duración total + intensidad */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            {t('coach.planEditor.aerobicBlock.totalMinutes')}
          </label>
          <input
            type="number"
            min="0"
            className="input text-sm"
            placeholder={t('coach.planEditor.aerobicBlock.minutesPlaceholder')}
            value={block.aerobic_total_minutes || ''}
            onChange={(e) => onUpdate({ aerobic_total_minutes: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            {t('coach.planEditor.aerobicBlock.intensity')}
          </label>
          <select
            className="input text-sm"
            value={block.aerobic_intensity || 'moderate'}
            onChange={(e) => onUpdate({ aerobic_intensity: e.target.value })}
          >
            {INTENSITY_LEVELS.map((i) => (
              <option key={i.key} value={i.key}>
                {t(`workout.intensity.${i.key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Zona objetivo (Z1-Z5) — OBLIGATORIA */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          {t('coach.planEditor.aerobicBlock.targetZone')} <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {AEROBIC_ZONES.map((z) => {
            const selected = (block.aerobic_zone || 'Z2') === z.key
            return (
              <button
                key={z.key}
                type="button"
                onClick={() => onUpdate({ aerobic_zone: z.key })}
                className={`rounded-xl border-2 p-2 text-center transition-all ${
                  selected ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                title={`${z.range} · ${t(`workout.aerobicZones.${z.key}.short`)}`}
              >
                <p className={`text-sm font-bold ${selected ? 'text-sky-700' : 'text-gray-700'}`}>
                  {z.label}
                </p>
                <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{z.range}</p>
              </button>
            )
          })}
        </div>
        {(() => {
          const z = AEROBIC_ZONES.find((zz) => zz.key === (block.aerobic_zone || 'Z2'))
          if (!z) return null
          return (
            <div
              className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-2 border ${z.color}`}
            >
              <span className="font-bold flex-shrink-0">{z.label}</span>
              <span className="leading-tight">
                <strong>{t(`workout.aerobicZones.${z.key}.short`)}</strong>
                <span className="opacity-80"> · {t(`workout.aerobicZones.${z.key}.desc`)}</span>
                <span className="opacity-60"> · {t('workout.fcPct', { pct: z.pct })}</span>
              </span>
            </div>
          )
        })()}
      </div>

      {/* Intervalos: work/rest/rounds */}
      {showIntervals && (
        <div className="bg-sky-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-700">
            {t('coach.planEditor.aerobicBlock.intervalStructure')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">
                {t('coach.planEditor.aerobicBlock.workSeconds')}
              </label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                placeholder="30"
                value={block.aerobic_work_seconds || ''}
                onChange={(e) => onUpdate({ aerobic_work_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">
                {t('coach.planEditor.aerobicBlock.restSeconds')}
              </label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                placeholder="30"
                value={block.aerobic_rest_seconds || ''}
                onChange={(e) => onUpdate({ aerobic_rest_seconds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-0.5 block">
                {t('coach.planEditor.aerobicBlock.rounds')}
              </label>
              <input
                type="number"
                min="0"
                className="input text-sm"
                placeholder="8"
                value={block.aerobic_rounds || ''}
                onChange={(e) => onUpdate({ aerobic_rounds: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sensación esperada (opcional, complementa la zona) */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          {t('coach.planEditor.aerobicBlock.extraNote')}{' '}
          <span className="text-gray-400 font-normal">
            {t('coach.planEditor.aerobicBlock.optional')}
          </span>
        </label>
        <input
          className="input text-sm"
          placeholder={t('coach.planEditor.aerobicBlock.extraNotePlaceholder')}
          value={block.aerobic_expected_sensation || ''}
          onChange={(e) => onUpdate({ aerobic_expected_sensation: e.target.value })}
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          {t('coach.planEditor.aerobicBlock.extraNoteHint')}
        </p>
      </div>
    </div>
  )
}
