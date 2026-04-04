/**
 * MOTOR DE LÓGICA CONDICIONAL
 *
 * Determina qué preguntas deben mostrarse según las respuestas actuales.
 *
 * Formato de regla condicional en una pregunta:
 *
 *   conditional: {
 *     dependsOn: 'question_id',   // ID de la pregunta que la controla
 *     showWhen: true | false | 'valor_especifico'  // cuándo mostrar
 *   }
 *
 * Ejemplos:
 *   - Mostrar si la pregunta anterior fue "sí" (boolean):
 *       conditional: { dependsOn: 'tiene_lesiones', showWhen: true }
 *
 *   - Mostrar si la pregunta anterior fue "no":
 *       conditional: { dependsOn: 'tiene_lesiones', showWhen: false }
 *
 *   - Mostrar si eligió un valor específico (select):
 *       conditional: { dependsOn: 'lugar_entrenamiento', showWhen: 'Casa (con equipamiento)' }
 *
 *   - Mostrar si eligió cualquiera de varios valores (multiselect):
 *       conditional: { dependsOn: 'objetivos', showWhen: ['Rehabilitación', 'Lesiones'] }
 */

/**
 * Evalúa si una pregunta debe mostrarse según las respuestas actuales.
 *
 * @param {object} question - La pregunta a evaluar
 * @param {object} responses - { question_id: value } respuestas actuales
 * @returns {boolean} true si debe mostrarse
 */
export function shouldShowQuestion(question, responses) {
  // Si la pregunta no tiene condicional, siempre se muestra
  if (!question.conditional) return true

  const { dependsOn, showWhen } = question.conditional
  const currentValue = responses[dependsOn]

  // Si la pregunta padre no fue respondida, ocultar la condicional
  if (currentValue === undefined || currentValue === null || currentValue === '') {
    return false
  }

  // Caso: showWhen es booleano
  if (typeof showWhen === 'boolean') {
    // El valor puede llegar como boolean o como string 'true'/'false'
    const normalizedValue = typeof currentValue === 'boolean'
      ? currentValue
      : currentValue === 'true' || currentValue === true

    return normalizedValue === showWhen
  }

  // Caso: showWhen es un array (cualquiera de los valores)
  if (Array.isArray(showWhen)) {
    if (Array.isArray(currentValue)) {
      return showWhen.some(v => currentValue.includes(v))
    }
    return showWhen.includes(currentValue)
  }

  // Caso: showWhen es un string exacto
  if (typeof showWhen === 'string') {
    if (Array.isArray(currentValue)) {
      return currentValue.includes(showWhen)
    }
    return currentValue === showWhen
  }

  return true
}

/**
 * Filtra las preguntas de un módulo según las respuestas actuales.
 * Solo devuelve las que deben mostrarse.
 *
 * @param {object[]} questions - Lista de preguntas del módulo
 * @param {object} responses - Respuestas actuales
 * @returns {object[]} Preguntas visibles
 */
export function getVisibleQuestions(questions, responses) {
  return questions.filter(q => shouldShowQuestion(q, responses))
}

/**
 * Limpia respuestas de preguntas que dejaron de ser visibles.
 * Importante para no guardar datos de preguntas ocultas.
 *
 * @param {object[]} questions - Todas las preguntas del módulo
 * @param {object} responses - Respuestas actuales
 * @returns {object} Respuestas limpias
 */
export function cleanHiddenResponses(questions, responses) {
  const visibleIds = new Set(getVisibleQuestions(questions, responses).map(q => q.id))
  const cleaned = {}

  for (const [key, value] of Object.entries(responses)) {
    if (visibleIds.has(key)) {
      cleaned[key] = value
    }
  }

  return cleaned
}

/**
 * Valida que todas las preguntas requeridas y visibles tengan respuesta.
 *
 * @param {object[]} questions - Preguntas del módulo
 * @param {object} responses - Respuestas actuales
 * @returns {{ valid: boolean, missing: string[] }} Resultado de validación
 */
export function validateModule(questions, responses) {
  const visible = getVisibleQuestions(questions, responses)
  const missing = visible
    .filter(q => q.required)
    .filter(q => {
      const val = responses[q.id]
      if (val === undefined || val === null) return true
      if (typeof val === 'string' && val.trim() === '') return true
      if (Array.isArray(val) && val.length === 0) return true
      return false
    })
    .map(q => q.id)

  return { valid: missing.length === 0, missing }
}

/**
 * Valida todos los módulos de un formulario completo.
 *
 * @param {object[]} modules - Módulos habilitados del formulario
 * @param {object} responses - Respuestas completas
 * @returns {{ valid: boolean, errorsByModule: object }}
 */
export function validateForm(modules, responses) {
  const errorsByModule = {}
  let globalValid = true

  for (const mod of modules) {
    if (!mod.enabled) continue
    const { valid, missing } = validateModule(mod.questions, responses)
    if (!valid) {
      errorsByModule[mod.id] = missing
      globalValid = false
    }
  }

  return { valid: globalValid, errorsByModule }
}
