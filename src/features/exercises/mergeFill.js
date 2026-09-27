// ============================================================
// Espejo en el front de la regla de v56 (merge_exercises):
// el ejercicio que queda MANDA; solo se completan sus campos vacíos
// con los del que se va. Sirve para el comparador del modal de fusión.
// Si cambia la regla en la base, cambiarla acá también.
// ============================================================

const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '')

export const MERGE_FIELDS = [
  { key: 'muscle_group', label: 'Grupo muscular' },
  { key: 'description', label: 'Descripción' },
  { key: 'video_url', label: 'Video' },
  { key: 'technique_notes', label: 'Nota técnica' },
  { key: 'en.name', label: 'Nombre en inglés', i18n: ['en', 'name'] },
  { key: 'en.description', label: 'Descripción en inglés', i18n: ['en', 'description'] },
  { key: 'en.technique_notes', label: 'Nota técnica en inglés', i18n: ['en', 'technique_notes'] },
  { key: 'default_sets', label: 'Series por defecto' },
  { key: 'default_reps', label: 'Reps por defecto' },
  { key: 'default_weight', label: 'Peso por defecto' },
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

const FILLED_LABELS = {
  description: 'descripción',
  muscle_group: 'grupo muscular',
  video_url: 'video',
  technique_notes: 'nota técnica',
  default_sets: 'series por defecto',
  default_reps: 'reps por defecto',
  default_weight: 'peso por defecto',
  i18n: 'traducción al inglés',
}

export function filledSummary(filled) {
  return (filled || []).map((k) => FILLED_LABELS[k] || k)
}
