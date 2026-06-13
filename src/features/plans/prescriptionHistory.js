// ============================================================
// HISTORIAL DE PRESCRIPCIÓN (doc 48)
// ============================================================
//
// Trazabilidad de cambios de objetivos de un ejercicio dentro del plan de
// una alumna (el "clon", is_template=false). Cada vez que la coach cambia
// series / reps / peso / descanso / PSE sugerido in-place, registramos el
// antes→después + un motivo opcional en `plan_exercise_prescription_history`.
//
// El diff se hace sobre los VALORES DE DISPLAY (strings normalizados) para
// evitar falsos positivos (null vs '', 40 vs "40", formato de arrays, etc.)
// y para que lo guardado sea estable y auto-descriptivo aunque cambien los
// helpers de formato.
//
// `changes` (jsonb) tiene la forma { <fieldKey>: { old, new } } donde
// fieldKey ∈ PRESCRIPTION_FIELD_KEYS. La etiqueta visible se deriva en la UI
// (i18n del lado alumna; español hardcodeado del lado coach).
// ============================================================

import { displayReps } from './helpers'

export const PRESCRIPTION_FIELD_KEYS = ['sets', 'reps', 'weight', 'rest', 'pse']

// Etiquetas en español para la vista del coach (la vista alumna usa i18n).
export const PRESCRIPTION_FIELD_LABELS_ES = {
  sets: 'Series',
  reps: 'Reps',
  weight: 'Peso',
  rest: 'Descanso',
  pse: 'PSE',
}

// Normaliza un valor a string limpio; '' representa "sin valor".
function normalizeVal(v) {
  if (v == null) return ''
  const s = String(v).trim()
  if (s === '' || s.toLowerCase() === 'none') return ''
  return s
}

// Display del peso priorizando suggested_weights (array por serie) y cayendo
// a suggested_weight (legacy).
function weightDisplay(row) {
  if (!row) return ''
  if (row.suggested_weights) {
    const d = normalizeVal(displayReps(row.suggested_weights))
    if (d) return d
  }
  return normalizeVal(row.suggested_weight)
}

// Extrae el display de cada campo lógico desde una fila en formato DB.
function fieldDisplays(row) {
  return {
    sets: normalizeVal(row?.suggested_sets),
    reps: normalizeVal(displayReps(row?.suggested_reps)),
    weight: weightDisplay(row),
    rest: normalizeVal(row?.rest_time),
    pse: normalizeVal(row?.suggested_pse),
  }
}

/**
 * Compara la prescripción original vs la nueva (ambas en formato DB) y
 * devuelve los cambios reales, o null si no cambió ningún campo prescrito.
 *
 * @param {Object} origRow - fila DB original (suggested_*, rest_time)
 * @param {Object} newRow  - payload DB nuevo (salida de uiExToDBEx)
 * @returns {Object|null} { <fieldKey>: { old, new } }
 */
export function diffPrescription(origRow, newRow) {
  const a = fieldDisplays(origRow)
  const b = fieldDisplays(newRow)
  const changes = {}
  for (const key of PRESCRIPTION_FIELD_KEYS) {
    if (a[key] !== b[key]) {
      changes[key] = { old: a[key] || '—', new: b[key] || '—' }
    }
  }
  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Trae el historial de prescripción de un plan, ordenado del más reciente
 * al más viejo.
 *
 * @returns {Promise<Array>} filas de plan_exercise_prescription_history
 */
export async function fetchPrescriptionHistory(supabase, planId) {
  const { data, error } = await supabase
    .from('plan_exercise_prescription_history')
    .select('id, plan_exercise_id, plan_id, changed_at, changes, note')
    .eq('plan_id', planId)
    .order('changed_at', { ascending: false })
  if (error) {
    console.warn('[prescriptionHistory] fetch falló:', error)
    return []
  }
  return data || []
}

/** Agrupa un array de filas de historial por plan_exercise_id. */
export function groupHistoryByExercise(rows) {
  const map = {}
  for (const r of rows || []) {
    if (!map[r.plan_exercise_id]) map[r.plan_exercise_id] = []
    map[r.plan_exercise_id].push(r)
  }
  return map
}
