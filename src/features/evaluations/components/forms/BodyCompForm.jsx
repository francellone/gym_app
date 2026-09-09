import { useTranslation } from 'react-i18next'
import { calcBodyComp } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'
import SexSelector from '../SexSelector'

// ============================================================
// FORM: Composición Corporal
// ============================================================
// % grasa por Jackson-Pollock 3 / 7 pliegues, o ICC. Requiere mediciones
// de pliegues cutáneos / perímetros y datos antropométricos.
export default function BodyCompForm({ results, onChange, planMethod }) {
  const { t } = useTranslation()
  const method = planMethod || results.method || 'jp3'
  const sex = results.sex || 'male'

  const skinfoldFields = {
    jp3:
      sex === 'male'
        ? [
            ['chest', t('evalForms.skinfoldChest')],
            ['abdomen', t('evalForms.skinfoldAbdomen')],
            ['thigh', t('evalForms.skinfoldThigh')],
          ]
        : [
            ['triceps', t('evalForms.skinfoldTriceps')],
            ['suprailiac', t('evalForms.skinfoldSuprailiac')],
            ['thigh', t('evalForms.skinfoldThigh')],
          ],
    jp7: [
      ['chest', t('evalForms.skinfoldChest')],
      ['abdomen', t('evalForms.skinfoldAbdomen')],
      ['thigh', t('evalForms.skinfoldThigh')],
      ['triceps', t('evalForms.skinfoldTriceps')],
      ['subscapular', t('evalForms.skinfoldSubscapular')],
      ['suprailiac', t('evalForms.skinfoldSuprailiac')],
      ['midaxillary', t('evalForms.skinfoldMidaxillary')],
    ],
    dw: [
      ['biceps', t('evalForms.skinfoldBiceps')],
      ['triceps', t('evalForms.skinfoldTriceps')],
      ['subscapular', t('evalForms.skinfoldSubscapular')],
      ['suprailiac', t('evalForms.skinfoldSuprailiac')],
    ],
    navy: [],
  }

  const perimeterFields = {
    navy:
      sex === 'male'
        ? [
            ['neck', t('evalForms.perimeterNeck')],
            ['waist', t('evalForms.perimeterWaist')],
          ]
        : [
            ['neck', t('evalForms.perimeterNeck')],
            ['waist', t('evalForms.perimeterWaist')],
            ['hip', t('evalForms.perimeterHip')],
          ],
    jp3: [],
    jp7: [],
    dw: [],
  }

  const sFields = skinfoldFields[method] || []
  const pFields = perimeterFields[method] || []

  function update(patch) {
    const updated = { ...results, method, ...patch }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  function updateSkinfold(key, value) {
    const updated = { ...results, method, skinfolds: { ...results.skinfolds, [key]: value } }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  function updatePerimeter(key, value) {
    const updated = { ...results, method, perimeters: { ...results.perimeters, [key]: value } }
    const c = calcBodyComp(method, updated)
    onChange({ ...updated, result: c || null })
  }

  const computed = calcBodyComp(method, results)

  return (
    <div className="space-y-5">
      <MethodBadge evalType="body_comp" methodKey={method} />

      <SexSelector value={sex} onChange={(v) => update({ sex: v })} />

      <div className="grid grid-cols-2 gap-3">
        <NumInput
          label={t('evalForms.age')}
          unit={t('evalForms.unitYears')}
          placeholder="28"
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
        {method === 'navy' && (
          <NumInput
            label={t('evalForms.bodyCompHeight')}
            unit="cm"
            step="0.5"
            placeholder="175"
            value={results.height_cm || ''}
            onChange={(v) => update({ height_cm: v })}
          />
        )}
      </div>

      {sFields.length > 0 && (
        <div>
          <label className="label">{t('evalForms.bodyCompSkinfoldsTitle')}</label>
          <div className="grid grid-cols-2 gap-2">
            {sFields.map(([key, label]) => (
              <NumInput
                key={key}
                label={label}
                unit="mm"
                step="0.1"
                placeholder="0"
                value={results.skinfolds?.[key] || ''}
                onChange={(v) => updateSkinfold(key, v)}
              />
            ))}
          </div>
        </div>
      )}

      {pFields.length > 0 && (
        <div>
          <label className="label">{t('evalForms.bodyCompPerimetersTitle')}</label>
          <div className="grid grid-cols-2 gap-2">
            {pFields.map(([key, label]) => (
              <NumInput
                key={key}
                label={label}
                unit="cm"
                step="0.1"
                placeholder="0"
                value={results.perimeters?.[key] || ''}
                onChange={(v) => updatePerimeter(key, v)}
              />
            ))}
          </div>
        </div>
      )}

      {computed && (
        <div className="space-y-3">
          <ResultBox label={t('evalForms.bodyCompFatPct')} value={computed.fat_pct} unit="%" />
          {computed.fat_kg !== null && (
            <div className="grid grid-cols-2 gap-3">
              <ResultBox label={t('evalForms.bodyCompFatMass')} value={computed.fat_kg} unit="kg" />
              <ResultBox
                label={t('evalForms.bodyCompLeanMass')}
                value={computed.lean_kg}
                unit="kg"
              />
            </div>
          )}
          {computed.sum_mm && (
            <p className="text-xs text-gray-400 text-center">
              {t('evalForms.bodyCompSkinfoldSum', { value: computed.sum_mm })}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="label">{t('evalForms.notes')}</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder={t('evalForms.bodyCompNotesPlaceholder')}
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
