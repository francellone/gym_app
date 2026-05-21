/**
 * TIPOS DE PREGUNTA SOPORTADOS
 * Cada tipo define cómo se renderiza y cómo se valida la respuesta.
 *
 * Regla de datos: preferir inputs estructurados para que las respuestas
 * sean analizables y comparables entre estudiantes.
 */

export const QUESTION_TYPES = {
  TEXT: 'text',           // Texto libre
  TEXTAREA: 'textarea',   // Texto largo
  SELECT: 'select',       // Una opción de una lista
  MULTISELECT: 'multiselect', // Múltiples opciones
  BOOLEAN: 'boolean',     // Sí / No
  SCALE: 'scale',         // Escala numérica (ej: 1-10)
  EMAIL: 'email',         // Email con validación
  PHONE: 'phone',         // Teléfono
  NUMBER: 'number',       // Número
  DATE: 'date',           // Fecha
}

/**
 * Metadatos de cada tipo (etiqueta legible, ícono, si soporta opciones, etc.)
 */
export const QUESTION_TYPE_META = {
  [QUESTION_TYPES.TEXT]: {
    label: 'Texto corto',
    icon: '✏️',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.TEXTAREA]: {
    label: 'Texto largo',
    icon: '📝',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.SELECT]: {
    label: 'Selección única',
    icon: '🔘',
    hasOptions: true,
    hasDetail: false,
  },
  [QUESTION_TYPES.MULTISELECT]: {
    label: 'Selección múltiple',
    icon: '☑️',
    hasOptions: true,
    hasDetail: false,
  },
  [QUESTION_TYPES.BOOLEAN]: {
    label: 'Sí / No',
    icon: '✅',
    hasOptions: false,
    hasDetail: true, // puede tener campo de detalle condicional
  },
  [QUESTION_TYPES.SCALE]: {
    label: 'Escala',
    icon: '📊',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.EMAIL]: {
    label: 'Email',
    icon: '📧',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.PHONE]: {
    label: 'Teléfono',
    icon: '📱',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.NUMBER]: {
    label: 'Número',
    icon: '🔢',
    hasOptions: false,
    hasDetail: false,
  },
  [QUESTION_TYPES.DATE]: {
    label: 'Fecha',
    icon: '📅',
    hasOptions: false,
    hasDetail: false,
  },
}
