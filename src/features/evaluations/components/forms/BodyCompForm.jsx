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
  const method = planMethod || results.method || 'jp3'
  const sex = results.sex || 'male'

  const skinfoldFields = {
    jp3:
      sex === 'male'
        ? [
            ['chest', 'Pectoral'],
            ['abdomen', 'Abdominal'],
            ['thigh', 'Muslo'],
          ]
        : [
            ['triceps', 'Tríceps'],
            ['suprailiac', 'Suprailiaco'],
            ['thigh', 'Muslo'],
          ],
    jp7: [
      ['chest', 'Pectoral'],
      ['abdomen', 'Abdominal'],
      ['thigh', 'Muslo'],
      ['triceps', 'Tríceps'],
      ['subscapular', 'Subescapular'],
      ['suprailiac', 'Suprailiaco'],
      ['midaxillary', 'Midaxilar'],
    ],
    dw: [
      ['biceps', 'Bíceps'],
      ['triceps', 'Tríceps'],
      ['subscapular', 'Subescapular'],
      ['suprailiac', 'Suprailiaco'],
    ],
    navy: [],
  }

  const perimeterFields = {
    navy:
      sex === 'male'
        ? [
            ['neck', 'Cuello'],
            ['waist', 'Cintura'],
          ]
        : [
            ['neck', 'Cuello'],
            ['waist', 'Cintura'],
            ['hip', 'Cadera'],
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
          label="Edad"
          unit="años"
          placeholder="28"
          value={results.age || ''}
          onChange={(v) => update({ age: v })}
        />
        <NumInput
          label="Peso corporal"
          unit="kg"
          step="0.1"
          placeholder="70"
          value={results.weight_kg || ''}
          onChange={(v) => update({ weight_kg: v })}
        />
        {method === 'navy' && (
          <NumInput
            label="Talla"
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
          <label className="label">Pliegues cutáneos (mm)</label>
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
          <label className="label">Perímetros (cm)</label>
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
          <ResultBox label="% Grasa corporal" value={computed.fat_pct} unit="%" />
          {computed.fat_kg !== null && (
            <div className="grid grid-cols-2 gap-3">
              <ResultBox label="Masa grasa" value={computed.fat_kg} unit="kg" />
              <ResultBox label="Masa magra" value={computed.lean_kg} unit="kg" />
            </div>
          )}
          {computed.sum_mm && (
            <p className="text-xs text-gray-400 text-center">Suma pliegues: {computed.sum_mm} mm</p>
          )}
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones, equipo utilizado..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
