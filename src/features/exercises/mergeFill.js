// ============================================================
// Espejo en el front de la regla de v56 (merge_exercises):
// el ejercicio que queda MANDA; solo se completan sus campos vacíos
// con los del que se va. Sirve para el comparador del modal de fusión.
// Si cambia la regla en la base, cambiarla acá también.
// ============================================================

const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '')

// labelKey: clave i18n (coach.exercises.mergeFields.*); el componente la traduce.
const F = 'coach.exercises.mergeFields.'
export const MERGE_FIELDS = [
  { key: 'muscle_group', labelKey: F + 'muscle_group' },
  { key: 'description', labelKey: F + 'description' },
  { key: 'video_url', labelKey: F + 'video_url' },
  { key: 'technique_notes', labelKey: F + 'technique_notes' },
  { key: 'en.name', labelKey: F + 'enName', i18n: ['en', 'name'] },
  { key: 'en.description', labelKey: F + 'enDescription', i18n: ['en', 'description'] },
  { key: 'en.technique_notes', labelKey: F + 'enTechniqueNotes', i18n: ['en', 'technique_notes'] },
  { key: 'default_sets', labelKey: F + 'default_sets' },
  { key: 'default_reps', labelKey: F + 'default_reps' },
  { key: 'default_weight', labelKey: F + 'default_weight' },
]

function read(ex, field) {
  if (!ex) return null
  if (field.i18n) {
    const [lang, k] = field.i18n
    return ex.i18n?.[lang]?.[k] ?? null
  }
  return ex[field.key] ?? null
}

/**
 * Compara campo a campo. Devuelve solo las filas donde alguno tiene dato.
 * outcome: 'same' | 'keep' (solo el que queda lo tiene) |
 *          'fill' (se completa con el que se va) |
 *          'drop' (los dos tienen y son distintos: gana el que queda)
 */
export function compareForMerge(from, into) {
  return MERGE_FIELDS.map((f) => {
    const a = read(from, f)
    const b = read(into, f)
    let outcome
    if (blank(a) && blank(b)) return null
    if (blank(b)) outcome = 'fill'
    else if (blank(a)) outcome = 'keep'
    else outcome = String(a).trim() === String(b).trim() ? 'same' : 'drop'
    return { ...f, from: a, into: b, outcome }
  }).filter(Boolean)
}

// Campos que devuelve merge_exercises en counts.filled → coach.exercises.filled.*
const FILLED_KEYS = new Set([
  'description',
  'muscle_group',
  'video_url',
  'technique_notes',
  'default_sets',
  'default_reps',
  'default_weight',
  'i18n',
])

/** Nombres legibles de los campos completados. `t` = función de i18next. */
export function filledSummary(filled, t) {
  return (filled || []).map((k) => (FILLED_KEYS.has(k) ? t(`coach.exercises.filled.${k}`) : k))
}
