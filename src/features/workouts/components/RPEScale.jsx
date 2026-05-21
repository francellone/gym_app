import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// ============================================================
// Escala RPE Cardio (aeróbico) — Talk Test + Zonas
// Z1: 1–2 | Z2: 3–4 | Z3: 5–6 | Z4: 7 | Z5: 8–10
// ============================================================
export const RPE_CARDIO = [
  {
    n: 1,
    zone: 'Z1',
    pct: '50–55%',
    short: 'muy suave',
    desc: 'nasal · podés cantar · activación mínima',
  },
  {
    n: 2,
    zone: 'Z1',
    pct: '55–60%',
    short: 'suave',
    desc: 'respiración tranquila · hablás sin pausas',
  },
  {
    n: 3,
    zone: 'Z2',
    pct: '60–65%',
    short: 'leve',
    desc: 'resp. más profunda · frases completas · cómodo',
  },
  {
    n: 4,
    zone: 'Z2',
    pct: '65–70%',
    short: 'moderado bajo',
    desc: 'resp. estable · conversación fluida · ritmo constante',
  },
  {
    n: 5,
    zone: 'Z3',
    pct: '70–75%',
    short: 'moderado',
    desc: 'resp. evidente · frases con pausas · sostenido',
  },
  {
    n: 6,
    zone: 'Z3',
    pct: '75–80%',
    short: 'moderado-alto',
    desc: 'resp. profunda · frases cortas · incomodidad controlada',
  },
  {
    n: 7,
    zone: 'Z4',
    pct: '80–85%',
    short: 'alto',
    desc: 'resp. fuerte · 2–3 palabras · foco mental',
  },
  {
    n: 8,
    zone: 'Z5',
    pct: '85–90%',
    short: 'muy alto',
    desc: 'resp. agitada · palabras sueltas · fatiga clara',
  },
  {
    n: 9,
    zone: 'Z5',
    pct: '90–95%',
    short: 'casi máximo',
    desc: 'resp. desbordada · no podés hablar · al límite',
  },
  {
    n: 10,
    zone: 'Z5',
    pct: '95–100%',
    short: 'máximo',
    desc: 'resp. caótica · sin habla · segundos',
  },
]

// ============================================================
// Escala RPE Circuito — sensación global (1–10 con descriptores cortos)
// ============================================================
export const RPE_CIRCUIT = [
  { n: 1, short: 'muy suave', desc: 'calentamiento' },
  { n: 2, short: 'muy suave', desc: 'calentamiento' },
  { n: 3, short: 'muy suave', desc: 'calentamiento' },
  { n: 4, short: 'podrías seguir más', desc: 'bastante margen' },
  { n: 5, short: 'podrías seguir más', desc: 'bastante margen' },
  { n: 6, short: 'desafiante', desc: 'controlado' },
  { n: 7, short: 'desafiante', desc: 'controlado' },
  { n: 8, short: 'muy exigente', desc: 'cuesta sostener' },
  { n: 9, short: 'muy exigente', desc: 'cuesta sostener' },
  { n: 10, short: 'al límite', desc: 'no podés más' },
]

// Color del botón según el número (común a las dos escalas)
function rpeColor(n, selected) {
  if (!selected) return 'bg-gray-100 text-gray-500 hover:bg-gray-200'
  if (n >= 8) return 'bg-red-500 text-white'
  if (n >= 5) return 'bg-orange-400 text-white'
  return 'bg-green-500 text-white'
}

// Color de la zona Z1–Z5 (sólo para escala cardio)
function zoneColor(zone) {
  switch (zone) {
    case 'Z1':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'Z2':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'Z3':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'Z4':
      return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'Z5':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

/**
 * Componente unificado de escala RPE para registro del alumno.
 *
 * variant:
 *   - 'cardio'  → escala completa con talk test + zonas (aeróbico)
 *   - 'circuit' → escala 1–10 con descriptores cortos (circuito / HIIT)
 *   - 'plain'   → 1–10 sin descriptores (fuerza, comportamiento legado)
 *
 * El componente siempre captura un valor 1–10 → sin cambios en la base
 * de datos. Lo único que cambia entre variantes es la información que
 * se muestra al alumno al lado o debajo de los botones.
 */
export default function RPEScale({
  value,
  onChange,
  variant = 'cardio',
  label = 'Esfuerzo percibido (PSE)',
  helpOpen: helpOpenProp,
  onToggleHelp,
}) {
  const [helpOpenLocal, setHelpOpenLocal] = useState(false)
  const helpOpen = helpOpenProp != null ? helpOpenProp : helpOpenLocal
  const toggleHelp = () => {
    if (onToggleHelp) onToggleHelp(!helpOpen)
    else setHelpOpenLocal((o) => !o)
  }

  const selected = value
  const showZones = variant === 'cardio'
  const showDescriptors = variant === 'cardio' || variant === 'circuit'
  const scale = variant === 'cardio' ? RPE_CARDIO : variant === 'circuit' ? RPE_CIRCUIT : null

  const selectedItem = scale?.find((s) => s.n === selected) || null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">{label}</label>
        {showDescriptors && (
          <button
            type="button"
            onClick={toggleHelp}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline flex items-center gap-1"
          >
            {helpOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Ver escala
          </button>
        )}
      </div>

      {/* Botones 1–10 */}
      <div className="flex gap-1.5 flex-wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
          const isSelected = selected === n
          const item = scale?.find((s) => s.n === n)
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(isSelected ? null : n)}
              className={`relative w-8 h-8 rounded-lg text-sm font-bold transition-all ${rpeColor(n, isSelected)}`}
              title={item ? `${item.short}` : ''}
            >
              {n}
              {showZones && item && (
                <span
                  className={`absolute -top-1 -right-1 text-[8px] font-bold rounded-full px-1 leading-tight border ${zoneColor(item.zone)}`}
                >
                  {item.zone}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Descriptor del valor seleccionado (compacto, visible siempre que haya valor) */}
      {selected && selectedItem && showDescriptors && (
        <div
          className={`rounded-lg px-2.5 py-1.5 text-xs flex items-start gap-2 ${
            selected >= 8
              ? 'bg-red-50 text-red-800'
              : selected >= 5
                ? 'bg-orange-50 text-orange-800'
                : 'bg-green-50 text-green-800'
          }`}
        >
          {showZones && (
            <span
              className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 border flex-shrink-0 ${zoneColor(selectedItem.zone)}`}
            >
              {selectedItem.zone}
            </span>
          )}
          <span className="leading-snug">
            <strong>
              {selected} — {selectedItem.short}
            </strong>
            <span className="opacity-80"> · {selectedItem.desc}</span>
          </span>
        </div>
      )}

      {/* Tabla completa (toggle con "Ver escala") */}
      {helpOpen && scale && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {variant === 'cardio' ? (
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-center py-1.5 px-1.5 font-semibold">#</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold">Zona</th>
                  <th className="text-left py-1.5 px-1.5 font-semibold">Sensación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {RPE_CARDIO.map((r) => (
                  <tr key={r.n} className={selected === r.n ? 'bg-gray-50 font-semibold' : ''}>
                    <td className="text-center py-1.5 px-1.5 font-mono">{r.n}</td>
                    <td className="text-center py-1.5 px-1.5">
                      <span
                        className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${zoneColor(r.zone)}`}
                      >
                        {r.zone}
                      </span>
                    </td>
                    <td className="py-1.5 px-1.5 text-gray-700 leading-tight">
                      <span className="font-semibold">{r.short}</span>
                      <span className="text-gray-400"> · </span>
                      <span className="text-gray-500">{r.desc}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-center py-1.5 px-1.5 font-semibold">#</th>
                  <th className="text-left py-1.5 px-1.5 font-semibold">Sensación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Para circuito agrupamos visualmente: 1–3, 4–5, 6–7, 8–9, 10 */}
                {[
                  { range: '1–3', short: 'muy suave', desc: 'calentamiento' },
                  { range: '4–5', short: 'podrías seguir más', desc: 'bastante margen' },
                  { range: '6–7', short: 'desafiante', desc: 'controlado' },
                  { range: '8–9', short: 'muy exigente', desc: 'cuesta sostener' },
                  { range: '10', short: 'al límite', desc: 'no podés más' },
                ].map((r) => (
                  <tr key={r.range}>
                    <td className="text-center py-1.5 px-1.5 font-mono font-semibold text-gray-600">
                      {r.range}
                    </td>
                    <td className="py-1.5 px-1.5 text-gray-700 leading-tight">
                      <span className="font-semibold">{r.short}</span>
                      <span className="text-gray-400"> · </span>
                      <span className="text-gray-500">{r.desc}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
