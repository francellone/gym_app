import { FMS_PATTERNS, calcFMSScore } from '../../helpers'
import MethodBadge from '../MethodBadge'
import NumInput from '../NumInput'
import ResultBox from '../ResultBox'
import ScoreButton from '../ScoreButton'

// Puntajes posibles por patrón motor (0 = dolor / no completa, 3 = perfecto).
const SCORES = [0, 1, 2, 3]

// ============================================================
// FORM: Scored (FMS / SFMA — Funcional / Movilidad)
// ============================================================
// Puntúa cada patrón motor 0-3 (ScoreButton). Suma da el FMS Score total.
// Detecta asimetrías y patrones con dolor.
export default function ScoredForm({ results, onChange, planMethod }) {
  const method = planMethod || results.method || 'fms'

  function updateFMS(i, field, value) {
    const patterns = [...(results.fms_patterns || [])]
    patterns[i] = { ...patterns[i], [field]: value }
    const { total, asymmetries } = calcFMSScore(patterns)
    onChange({ ...results, method, fms_patterns: patterns, result: { total, asymmetries } })
  }

  const fmsTotal = results.result?.total

  return (
    <div className="space-y-5">
      <MethodBadge evalType="scored" methodKey={method} />

      {method === 'fms' && (
        <div className="space-y-4">
          {(
            results.fms_patterns ||
            FMS_PATTERNS.map((p) => ({
              ...p,
              score: null,
              score_left: null,
              score_right: null,
              pain: false,
              notes: '',
            }))
          ).map((p, i) => (
            <div key={p.key} className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 flex-1">{p.label}</p>
                <button
                  type="button"
                  onClick={() => updateFMS(i, 'pain', !p.pain)}
                  className={`text-xs px-2 py-1 rounded-lg font-medium transition-all ${
                    p.pain
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'bg-white text-gray-400 border border-gray-200'
                  }`}
                >
                  {p.pain ? '⚠️ Dolor' : 'Sin dolor'}
                </button>
              </div>

              {p.bilateral ? (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ['score_left', '← Izquierda'],
                    ['score_right', 'Derecha →'],
                  ].map(([field, lbl]) => (
                    <div key={field}>
                      <p className="text-xs text-gray-500 mb-2">{lbl}</p>
                      <div className="flex gap-1.5">
                        {SCORES.map((s) => (
                          <ScoreButton
                            key={s}
                            value={s}
                            selected={p[field] === s}
                            onClick={() => updateFMS(i, field, p[field] === s ? null : s)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Puntuación</p>
                  <div className="flex gap-1.5">
                    {SCORES.map((s) => (
                      <ScoreButton
                        key={s}
                        value={s}
                        selected={p.score === s}
                        onClick={() => updateFMS(i, 'score', p.score === s ? null : s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <input
                className="input text-xs"
                placeholder="Observaciones de este patrón..."
                value={p.notes || ''}
                onChange={(e) => updateFMS(i, 'notes', e.target.value)}
              />
            </div>
          ))}

          {fmsTotal !== undefined && fmsTotal !== null && (
            <ResultBox
              label="Puntaje FMS Total"
              value={fmsTotal}
              unit="/ 21"
              sub={
                fmsTotal < 14
                  ? '⚠️ Riesgo de lesión — score < 14'
                  : results.result?.asymmetries?.length > 0
                    ? `Asimetrías detectadas en: ${results.result.asymmetries.join(', ')}`
                    : '✅ Score dentro del rango aceptable'
              }
            />
          )}
        </div>
      )}

      {method === 'sit_reach' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Distancia desde la línea de los pies. Positivo = más allá de los pies.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label="Mejor intento"
              unit="cm"
              step="0.5"
              placeholder="Ej: 12"
              value={results.distance_left_cm || ''}
              onChange={(v) => onChange({ ...results, distance_left_cm: v })}
            />
            <NumInput
              label="Segundo intento"
              unit="cm"
              step="0.5"
              placeholder="Ej: 10"
              value={results.distance_right_cm || ''}
              onChange={(v) => onChange({ ...results, distance_right_cm: v })}
            />
          </div>
          {results.distance_left_cm && (
            <ResultBox
              label="Flexibilidad isquiosural"
              value={results.distance_left_cm}
              unit="cm"
            />
          )}
        </div>
      )}

      {method === 'shoulder_mob' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Distancia entre ambas manos detrás de la espalda. Menor = mejor movilidad.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label="Mano derecha arriba"
              unit="cm"
              step="0.5"
              placeholder="Ej: 5"
              value={results.distance_left_cm || ''}
              onChange={(v) => onChange({ ...results, distance_left_cm: v })}
            />
            <NumInput
              label="Mano izquierda arriba"
              unit="cm"
              step="0.5"
              placeholder="Ej: 8"
              value={results.distance_right_cm || ''}
              onChange={(v) => onChange({ ...results, distance_right_cm: v })}
            />
          </div>
          {results.distance_left_cm && results.distance_right_cm && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
              {Math.abs(
                parseFloat(results.distance_left_cm) - parseFloat(results.distance_right_cm)
              ) > 1.5
                ? '⚠️ Asimetría detectada (diferencia > 1.5 cm)'
                : '✅ Simetría dentro del rango normal'}
            </div>
          )}
        </div>
      )}

      {method === 'y_balance' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            3 vectores de alcance en apoyo monopodal (cm). Normalizar dividiendo por largo de
            pierna.
          </p>
          {[
            ['reach_anterior', 'Vector Anterior'],
            ['reach_posteromedial', 'Vector Posteromedial'],
            ['reach_posterolateral', 'Vector Posterolateral'],
          ].map(([field, label]) => (
            <div key={field}>
              <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
              <div className="grid grid-cols-2 gap-3">
                <NumInput
                  label="Izquierda"
                  unit="cm"
                  step="0.5"
                  placeholder="0"
                  value={results[`${field}_l`] || ''}
                  onChange={(v) => onChange({ ...results, [`${field}_l`]: v })}
                />
                <NumInput
                  label="Derecha"
                  unit="cm"
                  step="0.5"
                  placeholder="0"
                  value={results[`${field}_r`] || ''}
                  onChange={(v) => onChange({ ...results, [`${field}_r`]: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label">Notas generales</label>
        <textarea
          className="input resize-none text-sm"
          rows={2}
          placeholder="Observaciones de la evaluación..."
          value={results.notes || ''}
          onChange={(e) => onChange({ ...results, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
