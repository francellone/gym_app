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
          label="Distancia recorrida en 12 min"
          unit="m"
          placeholder="2800"
          value={results.distance_m || ''}
          onChange={(v) => update({ distance_m: v })}
          hint="Test Cooper clásico: correr 12 minutos y medir distancia"
        />
      )}

      {method === 'rockport' && (
        <div className="space-y-3">
          <SexSelector value={results.sex || 'male'} onChange={(v) => update({ sex: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label="Edad"
              unit="años"
              placeholder="30"
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
            <NumInput
              label="Tiempo en caminar 1 milla"
              unit="min"
              step="0.01"
              placeholder="12.5"
              value={results.time_min || ''}
              onChange={(v) => update({ time_min: v })}
              hint="1 milla = 1609 m"
            />
            <NumInput
              label="FC al finalizar"
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
          label="Nivel alcanzado (Yo-Yo Nivel 1)"
          placeholder="Ej: 16.3"
          value={results.yoyo_level || ''}
          onChange={(v) => update({ yoyo_level: v })}
          hint="Nivel en formato etapa.número (ej: 16.3)"
        />
      )}

      {method === 'beep' && (
        <div className="grid grid-cols-2 gap-3">
          <NumInput
            label="Nivel alcanzado"
            placeholder="Ej: 12"
            value={results.beep_level || ''}
            onChange={(v) => update({ beep_level: v })}
          />
          <NumInput
            label="Velocidad (km/h)"
            step="0.1"
            placeholder="12"
            value={results.beep_speed || ''}
            onChange={(v) => update({ beep_speed: v })}
          />
        </div>
      )}

      {method === 'harvard' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Pulso de recuperación: contar durante 30 seg y multiplicar × 2
          </p>
          <div className="grid grid-cols-3 gap-3">
            <NumInput
              label={`FC 1'-1'30"`}
              unit="bpm"
              placeholder="150"
              value={results.hr1 || ''}
              onChange={(v) => update({ hr1: v })}
            />
            <NumInput
              label={`FC 2'-2'30"`}
              unit="bpm"
              placeholder="130"
              value={results.hr2 || ''}
              onChange={(v) => update({ hr2: v })}
            />
            <NumInput
              label={`FC 3'-3'30"`}
              unit="bpm"
              placeholder="120"
              value={results.hr3 || ''}
              onChange={(v) => update({ hr3: v })}
            />
          </div>
          <NumInput
            label="Duración del test"
            unit="seg"
            placeholder="300"
            value={results.step_duration_sec || '300'}
            onChange={(v) => update({ step_duration_sec: v })}
            hint="Máx 300 seg (5 min)"
          />
        </div>
      )}

      {vo2 !== null && (
        <ResultBox
          label={method === 'harvard' ? 'Índice Físico (PFI)' : 'VO₂max estimado'}
          value={vo2}
          unit={method === 'harvard' ? 'pts' : 'ml/kg/min'}
          sub={
            method === 'harvard'
              ? vo2 < 55
                ? 'Aceptable'
                : vo2 < 70
                  ? 'Bueno'
                  : 'Excelente'
              : vo2 < 30
                ? 'Muy bajo'
                : vo2 < 40
                  ? 'Regular'
                  : vo2 < 50
                    ? 'Bueno'
                    : vo2 < 60
                      ? 'Muy bueno'
                      : 'Superior'
          }
        />
      )}

      <div>
        <label className="label">Notas</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Condiciones del test, temperatura, sensaciones..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
