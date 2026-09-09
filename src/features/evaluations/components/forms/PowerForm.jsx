import { useTranslation } from 'react-i18next'
import { calcPower } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'

// ============================================================
// FORM: Potencia
// ============================================================
// Potencia explosiva en saltos (Lewis, Harman, broad jump) y sprints.
// Cada método requiere campos distintos (masa, altura de salto, distancia, tiempo).
export default function PowerForm({ results, onChange, planMethod }) {
  const { t } = useTranslation()
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
          <NumInput
            label={t('evalForms.powerBodyMass')}
            unit="kg"
            step="0.1"
            placeholder="70"
            value={results.mass_kg || ''}
            onChange={(v) => update('mass_kg', v)}
          />
        )}
        {needsJump && (
          <NumInput
            label={t('evalForms.powerJumpHeight')}
            unit="cm"
            step="0.5"
            placeholder="45"
            value={results.jump_cm || ''}
            onChange={(v) => update('jump_cm', v)}
          />
        )}
        {needsDist && (
          <NumInput
            label={t('evalForms.distance')}
            unit="m"
            step="0.01"
            placeholder={t('evalForms.egPlaceholder', { value: '2.35' })}
            value={results.distance_m || ''}
            onChange={(v) => update('distance_m', v)}
          />
        )}
        {needsTime && (
          <NumInput
            label={t('evalForms.time')}
            unit="seg"
            step="0.01"
            placeholder={t('evalForms.egPlaceholder', { value: '1.85' })}
            value={results.time_sec || ''}
            onChange={(v) => update('time_sec', v)}
          />
        )}
      </div>

      {computed && (
        <div className="space-y-3">
          {computed.power_w !== undefined && (
            <ResultBox label={t('evalForms.powerMeanLewis')} value={computed.power_w} unit="W" />
          )}
          {computed.peak_w !== undefined && (
            <ResultBox
              label={t('evalForms.powerPeakHarman')}
              value={computed.peak_w}
              unit="W"
              sub={t('evalForms.powerMeanSub', { value: computed.mean_w })}
            />
          )}
          {computed.distance_m !== undefined && method === 'broad_jump' && (
            <ResultBox
              label={t('evalForms.powerHorizontalDistance')}
              value={computed.distance_m}
              unit="m"
            />
          )}
          {computed.time_sec !== undefined && method === 'sprint' && (
            <ResultBox
              label={t('evalForms.powerTrackTime')}
              value={computed.time_sec}
              unit="seg"
              sub={t('evalForms.powerMeanSpeed', { value: computed.speed_ms })}
            />
          )}
        </div>
      )}

      <div>
        <label className="label">{t('evalForms.notes')}</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder={t('evalForms.powerNotesPlaceholder')}
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
