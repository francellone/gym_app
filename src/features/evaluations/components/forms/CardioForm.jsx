import { useTranslation } from 'react-i18next'
import { calcVO2max } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'
import SexSelector from '../SexSelector'

// ============================================================
// FORM: Cardio (Resistencia Cardiovascular)
// ============================================================
// VO2max según método: Cooper (12 min), Rockport (1 mile walk), o
// Astrand-Rhyming. Algunos requieren sexo, edad, peso.
export default function CardioForm({ results, onChange, planMethod }) {
  const { t } = useTranslation()
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
        <NumInput
          label={t('evalForms.cardioDistance12min')}
          unit="m"
          placeholder="2800"
          value={results.distance_m || ''}
          onChange={(v) => update({ distance_m: v })}
          hint={t('evalForms.cardioCooperHint')}
        />
      )}

      {method === 'rockport' && (
        <div className="space-y-3">
          <SexSelector value={results.sex || 'male'} onChange={(v) => update({ sex: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label={t('evalForms.age')}
              unit={t('evalForms.unitYears')}
              placeholder="30"
              value={results.age || ''}
              onChange={(v) => update({ age: v })}
            />
            <NumInput
              label={t('evalForms.bodyWeight')}
              unit="kg"
              step="0.1"
              placeholder="70"
              value={results.weight_kg || ''}
              onChange={(v) => update({ weight_kg: v })}
            />
            <NumInput
              label={t('evalForms.cardioMileWalkTime')}
              unit="min"
              step="0.01"
              placeholder="12.5"
              value={results.time_min || ''}
              onChange={(v) => update({ time_min: v })}
              hint={t('evalForms.cardioMileHint')}
            />
            <NumInput
              label={t('evalForms.cardioFinalHr')}
              unit="bpm"
              placeholder="150"
              value={results.heart_rate || ''}
              onChange={(v) => update({ heart_rate: v })}
            />
          </div>
        </div>
      )}

      {method === 'yoyo' && (
        <NumInput
          label={t('evalForms.cardioYoyoLevel')}
          placeholder={t('evalForms.egPlaceholder', { value: '16.3' })}
          value={results.yoyo_level || ''}
          onChange={(v) => update({ yoyo_level: v })}
          hint={t('evalForms.cardioYoyoHint')}
        />
      )}

      {method === 'beep' && (
        <div className="grid grid-cols-2 gap-3">
          <NumInput
            label={t('evalForms.cardioLevelReached')}
            placeholder={t('evalForms.egPlaceholder', { value: '12' })}
            value={results.beep_level || ''}
            onChange={(v) => update({ beep_level: v })}
          />
          <NumInput
            label={t('evalForms.cardioBeepSpeed')}
            step="0.1"
            placeholder="12"
            value={results.beep_speed || ''}
            onChange={(v) => update({ beep_speed: v })}
          />
        </div>
      )}

      {method === 'harvard' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{t('evalForms.cardioHarvardHint')}</p>
          <div className="grid grid-cols-3 gap-3">
            <NumInput
              label={t('evalForms.cardioHr1')}
              unit="bpm"
              placeholder="150"
              value={results.hr1 || ''}
              onChange={(v) => update({ hr1: v })}
            />
            <NumInput
              label={t('evalForms.cardioHr2')}
              unit="bpm"
              placeholder="130"
              value={results.hr2 || ''}
              onChange={(v) => update({ hr2: v })}
            />
            <NumInput
              label={t('evalForms.cardioHr3')}
              unit="bpm"
              placeholder="120"
              value={results.hr3 || ''}
              onChange={(v) => update({ hr3: v })}
            />
          </div>
          <NumInput
            label={t('evalForms.cardioTestDuration')}
            unit="seg"
            placeholder="300"
            value={results.step_duration_sec || '300'}
            onChange={(v) => update({ step_duration_sec: v })}
            hint={t('evalForms.cardioHarvardDurationHint')}
          />
        </div>
      )}

      {vo2 !== null && (
        <ResultBox
          label={method === 'harvard' ? t('evalForms.cardioPfi') : t('evalForms.cardioVo2max')}
          value={vo2}
          unit={method === 'harvard' ? 'pts' : 'ml/kg/min'}
          sub={
            method === 'harvard'
              ? vo2 < 55
                ? t('evalForms.ratingAcceptable')
                : vo2 < 70
                  ? t('evalForms.ratingGood')
                  : t('evalForms.ratingExcellent')
              : vo2 < 30
                ? t('evalForms.ratingVeryLow')
                : vo2 < 40
                  ? t('evalForms.ratingFair')
                  : vo2 < 50
                    ? t('evalForms.ratingGood')
                    : vo2 < 60
                      ? t('evalForms.ratingVeryGood')
                      : t('evalForms.ratingSuperior')
          }
        />
      )}

      <div>
        <label className="label">{t('evalForms.notes')}</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder={t('evalForms.cardioNotesPlaceholder')}
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
