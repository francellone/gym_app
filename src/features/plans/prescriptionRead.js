// ============================================================
// prescriptionRead.js — leer la prescripción POR SERIE como la lee el armador
// ------------------------------------------------------------
// El armador del coach guarda reps y pesos con `serializeReps`:
//   - todas las series iguales  → string suelto  "10"
//   - series diferenciadas       → array JSON      ["8","8","6"]
//   - un solo valor              → string suelto
// Y al reabrir el plan, `dbExToUIEx` hace Array(sets).fill(valor): para el
// armador un valor suelto significa "esto en TODAS las series".
//
// Hasta v54 la tarjeta de registro leía el string suelto como "solo la
// serie 1" (parseReps devuelve [raw]) y dejaba las demás vacías. Se notaba
// poco porque los campos eran editables; con el registro por confirmación
// dejaba la tarjeta sin poder confirmar en 18 de los 21 ejercicios del
// plan de Franco (2026-09-22). Esta es la lectura correcta, compartida.
//
// Regla:
//   valor suelto           → el mismo en todas las series
//   array                  → serie a serie; un hueco toma el valor de la
//                            serie anterior (misma regla que la cascada);
//                            si sobran series, la última se repite
// Todo se devuelve como string ('' cuando no hay nada). Funciones puras.
// ============================================================

function isEmpty(v) {
  return v === '' || v == null || v === 'None' || v === 'none'
}

function toStr(v) {
  return isEmpty(v) ? '' : String(v)
}

// Interpreta el valor crudo (string JSON, string suelto, número o array).
// @returns {{ kind: 'array'|'scalar'|'empty', values: string[] }}
export function parsePrescription(raw) {
  if (isEmpty(raw)) return { kind: 'empty', values: [] }
  if (Array.isArray(raw)) return { kind: 'array', values: raw.map(toStr) }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return { kind: 'array', values: parsed.map(toStr) }
      } catch {
        /* no era JSON: cae a escalar */
      }
    }
    return { kind: 'scalar', values: [trimmed] }
  }
  return { kind: 'scalar', values: [String(raw)] }
}

// Expande la prescripción a `setsCount` series.
export function expandPerSet(raw, setsCount) {
  const n = Math.max(0, parseInt(setsCount) || 0)
  const { kind, values } = parsePrescription(raw)
  if (n === 0) return kind === 'empty' ? [''] : [values[0] || '']
  if (kind === 'empty') return Array(n).fill('')
  if (kind === 'scalar') return Array(n).fill(values[0])
  const out = []
  let last = ''
  for (let i = 0; i < n; i++) {
    const v = i < values.length ? values[i] : ''
    if (v !== '') last = v
    out.push(last)
  }
  return out
}

// ¿Todas las series tienen el mismo valor (no vacío)?
export function isUniformPerSet(arr) {
  if (!arr || arr.length === 0) return false
  const first = toStr(arr[0])
  if (first === '') return false
  return arr.every((v) => toStr(v) === first)
}
