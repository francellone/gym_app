/**
 * RESOLUCIÓN DE IDIOMA DE UN FORMULARIO (plantillas bilingües)
 *
 * Ver docs/plan-formularios-bilingues.md.
 *
 * Principio rector: el alumno VE traducido, pero se GUARDA el valor canónico.
 * Por eso esta función NUNCA modifica `label` / `options` / `content` originales:
 * agrega campos `display*` que el renderer usa solo para mostrar. Las respuestas
 * siguen guardando los strings canónicos → la lógica condicional, el mapeo SQL
 * (`process_intake_submission`) y la lectura del coach quedan intactos.
 *
 * Formato aditivo dentro del config (todo opcional; sin nada de esto,
 * el formulario se comporta exactamente como hoy):
 *
 *   config.name_i18n            = { en: 'Monthly form' }
 *   intro.i18n                  = { en: { content: '...' } }
 *   module.i18n                 = { en: { title: '...' } }
 *   question.i18n               = { en: { label, placeholder, options: [...], stale } }
 *   question.hidden_for         = ['en']   // no mostrar esta pregunta a alumnos en ese idioma
 *
 * Reglas de seguridad (para que nada se rompa a mitad de traducción):
 *   - Campo de traducción vacío ⇒ fallback al canónico.
 *   - `options` traducidas se mapean POR ÍNDICE: si el largo no coincide con las
 *     canónicas, o la traducción está marcada `stale` (el coach editó las opciones
 *     canónicas después de traducir), se ignoran y se muestran las canónicas.
 *   - `hidden_for` filtra la pregunta ANTES de la validación (una required oculta
 *     no bloquea el envío). Un módulo que queda sin preguntas visibles se elimina.
 *   - El módulo de consentimiento se traduce pero NUNCA se filtra por hidden_for
 *     (el consentimiento es obligatorio en todos los idiomas).
 */

const DEFAULT_LANG = 'es'

/** String no vacío o null. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** ¿La pregunta está desactivada para este idioma? */
export function isQuestionHiddenFor(question, lang) {
  return Array.isArray(question?.hidden_for) && question.hidden_for.includes(lang)
}

/**
 * Opciones a MOSTRAR para una pregunta (las canónicas siguen siendo los valores).
 * Devuelve un array paralelo a `question.options`.
 */
function resolveDisplayOptions(question, translation) {
  const canonical = question.options || []
  const translated = translation?.options
  if (
    !Array.isArray(translated) ||
    translated.length !== canonical.length ||
    translation?.stale === true
  ) {
    return [...canonical]
  }
  // Fallback por opción: una traducción vacía muestra la canónica.
  return canonical.map((opt, i) => nonEmpty(translated[i]) || opt)
}

/** Pregunta con campos display* resueltos. No muta la original. */
function resolveQuestion(question, lang) {
  const translation = question.i18n?.[lang]
  return {
    ...question,
    displayLabel: nonEmpty(translation?.label) || question.label,
    displayPlaceholder: nonEmpty(translation?.placeholder) || question.placeholder,
    displayOptions: resolveDisplayOptions(question, translation),
    // Textos secundarios también escritos por el coach:
    displayMinLabel: nonEmpty(translation?.minLabel) || question.minLabel,
    displayMaxLabel: nonEmpty(translation?.maxLabel) || question.maxLabel,
    displayRequiredMessage: nonEmpty(translation?.requiredMessage) || question.requiredMessage,
  }
}

/**
 * Módulo con título/preguntas resueltos y filtradas por hidden_for.
 * Devuelve null si el módulo queda sin preguntas visibles.
 * @param {object} opts - { skipHiddenFilter } para el módulo de consentimiento.
 */
function resolveModule(module, lang, { skipHiddenFilter = false } = {}) {
  if (!module) return module

  const visibleQuestions = (module.questions || [])
    .filter((q) => skipHiddenFilter || !isQuestionHiddenFor(q, lang))
    .map((q) => resolveQuestion(q, lang))

  if (!skipHiddenFilter && (module.questions || []).length > 0 && visibleQuestions.length === 0) {
    return null
  }

  return {
    ...module,
    displayTitle: nonEmpty(module.i18n?.[lang]?.title) || module.title,
    questions: visibleQuestions,
  }
}

/**
 * Resuelve un config (plantilla o form_snapshot) para el idioma de un alumno.
 *
 * @param {object} config - config del formulario (no se muta)
 * @param {string} lang - idioma del alumno ('es' | 'en'); default 'es'
 * @returns {object} config nuevo con displayName / displayContent / displayTitle /
 *   displayLabel / displayPlaceholder / displayOptions, preguntas hidden_for
 *   filtradas y módulos vacíos eliminados. Siempre seguro de usar por el renderer,
 *   haya o no traducciones.
 */
export function resolveFormForLanguage(config, lang = DEFAULT_LANG) {
  if (!config || typeof config !== 'object') return config

  const resolved = {
    ...config,
    displayName: nonEmpty(config.name_i18n?.[lang]) || config.name || null,
    modules: (config.modules || []).map((m) => resolveModule(m, lang)).filter(Boolean),
  }

  if (typeof config.intro === 'string') {
    // Snapshots muy viejos guardaban la intro como string plano.
    resolved.intro = { content: config.intro, displayContent: config.intro }
  } else if (config.intro) {
    resolved.intro = {
      ...config.intro,
      displayContent: nonEmpty(config.intro.i18n?.[lang]?.content) || config.intro.content || '',
    }
  }

  if (config.consent) {
    // El consentimiento nunca se filtra: es obligatorio en todos los idiomas.
    resolved.consent = resolveModule(config.consent, lang, { skipHiddenFilter: true })
  }

  return resolved
}

/**
 * Nombre a mostrar de una plantilla cuyo nombre canónico vive en la columna
 * `intake_form_templates.name` (fuera del config).
 */
export function resolveTemplateName(canonicalName, config, lang = DEFAULT_LANG) {
  return nonEmpty(config?.name_i18n?.[lang]) || canonicalName
}

/**
 * Traduce una RESPUESTA guardada (valor canónico) a su texto de display,
 * usando una pregunta ya resuelta (con displayOptions). Para valores que no
 * son opciones (texto libre, números, booleanos) devuelve el valor tal cual.
 * Uso: mostrarle al alumno sus propias respuestas en su idioma.
 */
export function displayValueFor(question, value) {
  const mapOne = (v) => {
    const idx = (question?.options || []).indexOf(v)
    return idx >= 0 ? (question.displayOptions?.[idx] ?? v) : v
  }
  return Array.isArray(value) ? value.map(mapOne) : mapOne(value)
}
