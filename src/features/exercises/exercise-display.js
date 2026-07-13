/**
 * EJERCICIOS BILINGÜES — RESOLVER PURO
 *
 * Mismo patrón que resolve-form-language.js (formularios): el contenido
 * canónico vive en las columnas base de `exercises` (español) y las
 * traducciones opcionales en `exercises.i18n`:
 *
 *   i18n = { en: { name, description, technique_notes } }
 *
 * Regla: traducción presente y no vacía => se muestra; si no, fallback al
 * canónico. Nunca se guarda nada traducido en referencias (los planes/logs
 * referencian por id), así que esto es solo presentación.
 */

/** Campos de texto libre traducibles de un ejercicio. */
export const EXERCISE_I18N_FIELDS = ['name', 'description', 'technique_notes']

const CANONICAL_LANG = 'es'

/**
 * Resuelve los textos de un ejercicio para un idioma dado.
 *
 * @param {object|null|undefined} exercise fila de `exercises` (o el subset joineado)
 * @param {string} lang idioma del que mira ('es', 'en', 'en-US'...)
 * @returns {{ name: string, description: string|null, technique_notes: string|null }}
 */
export function exerciseDisplay(exercise, lang) {
  const base = {
    name: exercise?.name ?? '',
    description: exercise?.description ?? null,
    technique_notes: exercise?.technique_notes ?? null,
  }
  const short = normalizeLang(lang)
  if (!exercise || short === CANONICAL_LANG) return base

  const tr = exercise.i18n?.[short]
  if (!tr || typeof tr !== 'object') return base

  const out = { ...base }
  for (const field of EXERCISE_I18N_FIELDS) {
    const value = tr[field]
    if (typeof value === 'string' && value.trim() !== '') out[field] = value
  }
  return out
}

/** 'en-US' -> 'en'; null/undefined -> canónico. */
function normalizeLang(lang) {
  if (typeof lang !== 'string' || lang.trim() === '') return CANONICAL_LANG
  return lang.toLowerCase().split('-')[0]
}
