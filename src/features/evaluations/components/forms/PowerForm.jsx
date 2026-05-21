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
            label="Masa corporal"
            unit="kg"
            step="0.1"
            placeholder="70"
            value={results.mass_kg || ''}
            onChange={(v) => update('mass_kg', v)}
          />
        )}
        {needsJump && (
          <NumInput
            label="Altura de salto"
            unit="cm"
            step="0.5"
            placeholder="45"
            value={results.jump_cm || ''}
            onChange={(v) => update('jump_cm', v)}
          />
        )}
        {needsDist && (
          <NumInput
            label="Distancia"
            unit="m"
            step="0.01"
            placeholder="Ej: 2.35"
            value={results.distance_m || ''}
            onChange={(v) => update('distance_m', v)}
          />
        )}
        {needsTime && (
          <NumInput
            label="Tiempo"
            unit="seg"
            step="0.01"
            placeholder="Ej: 1.85"
            value={results.time_sec || ''}
            onChange={(v) => update('time_sec', v)}
          />
        )}
      </div>

      {computed && (
        <div className="space-y-3">
          {computed.power_w !== undefined && (
            <ResultBox label="Potencia media (Lewis)" value={computed.power_w} unit="W" />
          )}
          {computed.peak_w !== undefined && (
            <ResultBox
              label="Potencia pico (Harman)"
              value={computed.peak_w}
              unit="W"
              sub={`Potencia media: ${computed.mean_w} W`}
            />
          )}
          {computed.distance_m !== undefined && method === 'broad_jump' && (
            <ResultBox label="Distancia horizontal" value={computed.distance_m} unit="m" />
          )}
          {computed.time_sec !== undefined && method === 'sprint' && (
            <ResultBox
              label="Tiempo en pista"
              value={computed.time_sec}
              unit="seg"
              sub={`Velocidad media: ${computed.speed_ms} m/s`}
            />
          )}
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Tipo de superficie, calzado, intentos..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
