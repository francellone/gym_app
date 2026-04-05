/**
 * ESQUEMA BASE DEL FORMULARIO DE INGRESO
 *
 * Este es el formulario predeterminado que se crea para cada coach.
 * Cada coach puede:
 *   - Ocultar/activar módulos
 *   - Editar labels y opciones de preguntas
 *   - Agregar/eliminar preguntas dentro de cada módulo
 *   - Cambiar el orden de los módulos
 *   - Guardar distintas configuraciones como plantillas
 *
 * IMPORTANTE para la integridad de datos:
 *   - Los `id` de módulos y preguntas son INMUTABLES (no deben cambiarse al editar)
 *   - Al guardar una respuesta se almacena un snapshot del formulario + { question_id: value }
 *   - Esto permite que aunque el coach edite el label de una pregunta,
 *     la respuesta siga vinculada correctamente al question_id
 *
 * Tipos de pregunta disponibles: ver question-types.js
 */

import { QUESTION_TYPES } from './question-types.js'

// ─────────────────────────────────────────────────────────
// INTRODUCCIÓN (módulo especial, siempre visible)
// ─────────────────────────────────────────────────────────
export const DEFAULT_INTRO = {
  type: 'intro',
  editable: true,
  rich_text: true,
  content: `¡Bienvenido/a! 👋

Antes de comenzar, completá este formulario para que pueda conocerte mejor y diseñar un plan 100% personalizado para vos.

Solo te tomará unos minutos. Respondé con la mayor honestidad posible: cuanto más sepa sobre vos, mejor voy a poder ayudarte.

¡Arranquemos! 💪`,
}

// ─────────────────────────────────────────────────────────
// MÓDULOS BASE
// ─────────────────────────────────────────────────────────

export const DEFAULT_MODULES = [
  // ──────────────────────────────────────────────────────
  // MÓDULO 1: DATOS PERSONALES
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_datos_personales',
    title: 'Datos personales',
    emoji: '👤',
    enabled: true,
    editable: true,
    removable: false, // siempre presente
    order: 1,
    questions: [
      {
        id: 'nombre',
        type: QUESTION_TYPES.TEXT,
        label: '¿Cuál es tu nombre?',
        placeholder: 'Ej: María',
        required: true,
        editable: true,
        removable: false,
        autoComplete: 'given-name',
      },
      {
        id: 'apellido',
        type: QUESTION_TYPES.TEXT,
        label: '¿Y tu apellido?',
        placeholder: 'Ej: González',
        required: true,
        editable: true,
        removable: false,
        autoComplete: 'family-name',
      },
      {
        id: 'fecha_nacimiento',
        type: QUESTION_TYPES.DATE,
        label: '¿Cuál es tu fecha de nacimiento?',
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'genero',
        type: QUESTION_TYPES.SELECT,
        label: '¿Con qué género te identificás?',
        options: ['Femenino', 'Masculino', 'No binario', 'Prefiero no decirlo'],
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'email',
        type: QUESTION_TYPES.EMAIL,
        label: 'Email de contacto',
        placeholder: 'tu@email.com',
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'telefono',
        type: QUESTION_TYPES.PHONE,
        label: 'Teléfono / WhatsApp',
        placeholder: '+54 9 11 XXXX XXXX',
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'ubicacion',
        type: QUESTION_TYPES.TEXT,
        label: '¿En qué ciudad/zona estás?',
        placeholder: 'Ej: Buenos Aires, GBA Norte',
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 2: OBJETIVOS
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_objetivos',
    title: 'Objetivos',
    emoji: '🎯',
    enabled: true,
    editable: true,
    removable: false,
    order: 2,
    questions: [
      {
        id: 'objetivo_principal',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuál es tu objetivo principal?',
        options: [
          'Perder grasa',
          'Ganar músculo',
          'Mejorar resistencia',
          'Tonificar',
          'Mejorar salud general',
          'Preparación deportiva',
          'Rehabilitación',
          'Otro',
        ],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'objetivo_secundario',
        type: QUESTION_TYPES.SELECT,
        label: '¿Tenés un objetivo secundario? (opcional)',
        options: [
          'Perder grasa',
          'Ganar músculo',
          'Mejorar resistencia',
          'Tonificar',
          'Mejorar salud general',
          'Preparación deportiva',
          'Rehabilitación',
          'Ninguno',
        ],
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'plazo_objetivo',
        type: QUESTION_TYPES.SELECT,
        label: '¿En qué plazo querés ver resultados?',
        options: ['1 mes', '3 meses', '6 meses', '1 año', 'Largo plazo (sin prisa)'],
        required: true,
        editable: true,
        removable: true,
      },
      {
        id: 'objetivo_detalle',
        type: QUESTION_TYPES.TEXTAREA,
        label: 'Contame con tus palabras qué querés lograr',
        placeholder: 'Ej: Quiero sentirme con más energía, bajar 5kg antes del verano...',
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 3: ESTILO DE VIDA
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_estilo_vida',
    title: 'Estilo de vida',
    emoji: '🌿',
    enabled: true,
    editable: true,
    removable: true,
    order: 3,
    questions: [
      {
        id: 'horas_sueno',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuántas horas dormís por noche (en promedio)?',
        options: ['Menos de 5', '5-6 horas', '6-7 horas', '7-8 horas', 'Más de 8'],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'nivel_estres',
        type: QUESTION_TYPES.SCALE,
        label: '¿Cómo describirías tu nivel de estrés habitual?',
        min: 1,
        max: 10,
        minLabel: 'Muy bajo',
        maxLabel: 'Muy alto',
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'trabajo_tipo',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cómo es tu trabajo/actividad diaria?',
        options: ['Sedentario (oficina/casa)', 'Leve actividad física', 'Moderada actividad física', 'Intensa actividad física'],
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'hidratacion',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuánta agua tomás por día aproximadamente?',
        options: ['Menos de 1 litro', '1-1.5 litros', '1.5-2 litros', 'Más de 2 litros'],
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 4: ENTRENAMIENTO
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_entrenamiento',
    title: 'Entrenamiento',
    emoji: '🏋️',
    enabled: true,
    editable: true,
    removable: false,
    order: 4,
    questions: [
      {
        id: 'experiencia_nivel',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuál es tu nivel de experiencia entrenando?',
        options: ['Principiante (nunca entrené)', 'Básico (menos de 1 año)', 'Intermedio (1-3 años)', 'Avanzado (más de 3 años)'],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'frecuencia_semanal',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuántas veces por semana podés entrenar?',
        options: ['1-2 veces', '3 veces', '4 veces', '5 veces', '6+ veces'],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'duracion_sesion',
        type: QUESTION_TYPES.SELECT,
        label: '¿Cuánto tiempo tenés por sesión?',
        options: ['30 minutos', '45 minutos', '1 hora', '1:30 horas', 'Más de 1:30'],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'ultima_actividad',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Qué tipo de actividad física hacías últimamente?',
        placeholder: 'Ej: Caminaba 30 min, hacía yoga en casa, iba al gym 2 veces por semana...',
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 5: SALUD
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_salud',
    title: 'Salud',
    emoji: '🩺',
    enabled: true,
    editable: true,
    removable: false,
    order: 5,
    questions: [
      {
        id: 'tiene_lesiones',
        type: QUESTION_TYPES.BOOLEAN,
        label: '¿Tenés alguna lesión actual o reciente?',
        required: true,
        editable: true,
        removable: false,
        // Lógica condicional: si es "sí", mostrar el detalle
        conditionalTrigger: { showIfTrue: 'lesiones_detalle' },
      },
      {
        id: 'lesiones_detalle',
        type: QUESTION_TYPES.TEXTAREA,
        label: 'Describí tus lesiones o molestias',
        placeholder: 'Ej: Tendinitis en el hombro derecho, dolor lumbar crónico...',
        required: false,
        editable: true,
        removable: true,
        // Esta pregunta se muestra condicionalmente
        conditional: { dependsOn: 'tiene_lesiones', showWhen: true },
      },
      {
        id: 'patologias',
        type: QUESTION_TYPES.MULTISELECT,
        label: '¿Tenés alguna de estas condiciones de salud?',
        options: [
          'Hipertensión',
          'Diabetes tipo 1',
          'Diabetes tipo 2',
          'Obesidad',
          'Problemas cardíacos',
          'Problemas respiratorios',
          'Problemas articulares',
          'Ninguna',
        ],
        required: true,
        editable: true,
        removable: false,
      },
      {
        id: 'toma_medicacion',
        type: QUESTION_TYPES.BOOLEAN,
        label: '¿Tomás alguna medicación de forma habitual?',
        required: false,
        editable: true,
        removable: true,
        conditionalTrigger: { showIfTrue: 'medicacion_detalle' },
      },
      {
        id: 'medicacion_detalle',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Qué medicación tomás?',
        placeholder: 'Ej: Metformina 500mg, Losartán...',
        required: false,
        editable: true,
        removable: true,
        conditional: { dependsOn: 'toma_medicacion', showWhen: true },
      },
      {
        id: 'embarazo',
        type: QUESTION_TYPES.BOOLEAN,
        label: '¿Estás embarazada o en período de lactancia?',
        required: false,
        editable: true,
        removable: true,
        // Solo aplica a ciertas personas; el coach puede condicionar esto
        // al género si lo desea
        conditionalTrigger: { showIfTrue: 'embarazo_semanas' },
      },
      {
        id: 'embarazo_semanas',
        type: QUESTION_TYPES.SELECT,
        label: '¿En qué etapa estás?',
        options: ['Primer trimestre (1-12 sem)', 'Segundo trimestre (13-26 sem)', 'Tercer trimestre (27-40 sem)', 'Período de lactancia'],
        required: false,
        editable: true,
        removable: true,
        conditional: { dependsOn: 'embarazo', showWhen: true },
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 6: PREFERENCIAS DE ENTRENAMIENTO
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_preferencias',
    title: 'Preferencias',
    emoji: '⚙️',
    enabled: true,
    editable: true,
    removable: true,
    order: 6,
    questions: [
      {
        id: 'lugar_entrenamiento',
        type: QUESTION_TYPES.SELECT,
        label: '¿Dónde vas a entrenar?',
        options: ['Gimnasio con equipamiento completo', 'Casa (sin equipamiento)', 'Casa (con equipamiento)', 'Al aire libre', 'Mixto'],
        required: true,
        editable: true,
        removable: false,
        conditionalTrigger: { showIfValue: { value: 'Casa (con equipamiento)', show: 'equipamiento_detalle' } },
      },
      {
        id: 'equipamiento_detalle',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Qué equipamiento tenés en casa?',
        placeholder: 'Ej: Mancuernas hasta 15kg, banda elástica, soga...',
        required: false,
        editable: true,
        removable: true,
        conditional: { dependsOn: 'lugar_entrenamiento', showWhen: 'Casa (con equipamiento)' },
      },
      {
        id: 'ejercicios_a_evitar',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Hay ejercicios que quieras evitar o que no puedas hacer?',
        placeholder: 'Ej: No puedo hacer sentadilla profunda por rodilla, no me gustan las dominadas...',
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'tipo_entrenamiento_preferido',
        type: QUESTION_TYPES.MULTISELECT,
        label: '¿Qué tipo de entrenamiento preferís?',
        options: ['Pesas / fuerza', 'Cardio', 'HIIT', 'Funcional', 'Pilates / movilidad', 'Deportivo', 'Sin preferencia'],
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────
  // MÓDULO 7: INFORMACIÓN ADICIONAL
  // ──────────────────────────────────────────────────────
  {
    id: 'modulo_adicional',
    title: 'Información adicional',
    emoji: '💬',
    enabled: true,
    editable: true,
    removable: true,
    order: 7,
    questions: [
      {
        id: 'motivacion',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Qué te motiva a empezar ahora?',
        placeholder: 'Contame lo que quieras...',
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'intentos_previos',
        type: QUESTION_TYPES.BOOLEAN,
        label: '¿Ya intentaste entrenar antes y lo dejaste?',
        required: false,
        editable: true,
        removable: true,
        conditionalTrigger: { showIfTrue: 'intentos_previos_razon' },
      },
      {
        id: 'intentos_previos_razon',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Qué cosas te hicieron abandonar antes?',
        placeholder: 'Ej: Falta de tiempo, aburrimiento, lesiones...',
        required: false,
        editable: true,
        removable: true,
        conditional: { dependsOn: 'intentos_previos', showWhen: true },
      },
      {
        id: 'formato_preferido',
        type: QUESTION_TYPES.SELECT,
        label: '¿Qué formato de seguimiento preferís?',
        options: ['Rutina semana a semana', 'Plan mensual', 'Día a día', 'Sin preferencia'],
        required: false,
        editable: true,
        removable: true,
      },
      {
        id: 'observaciones',
        type: QUESTION_TYPES.TEXTAREA,
        label: '¿Algo más que quieras contarme?',
        placeholder: 'Cualquier información que creas relevante...',
        required: false,
        editable: true,
        removable: true,
      },
    ],
  },
]

// ──────────────────────────────────────────────────────────
// CONSENTIMIENTO (módulo fijo – no eliminable)
// ──────────────────────────────────────────────────────────
export const CONSENT_MODULE = {
  id: 'modulo_consentimiento',
  title: 'Consentimiento',
  emoji: '📋',
  enabled: true,
  editable: false,   // contenido no editable (solo el texto configurable)
  removable: false,  // obligatorio
  order: 999,        // siempre al final
  questions: [
    {
      id: 'consentimiento_datos',
      type: QUESTION_TYPES.BOOLEAN,
      label: 'Declaro que toda la información proporcionada es correcta y comprendo que debo consultar con un profesional de la salud ante cualquier condición médica antes de iniciar un programa de entrenamiento.',
      required: true,
      editable: false,
      removable: false,
    },
    {
      id: 'consentimiento_privacidad',
      type: QUESTION_TYPES.BOOLEAN,
      label: 'Acepto que mis datos sean utilizados por el coach para diseñar mi plan de entrenamiento personalizado.',
      required: true,
      editable: false,
      removable: false,
    },
  ],
}

// ──────────────────────────────────────────────────────────
// PLANTILLAS PREDEFINIDAS
// Cada plantilla es una configuración de módulos/preguntas
// que el coach puede cargar como punto de partida.
// ──────────────────────────────────────────────────────────
export const DEFAULT_TEMPLATES = [
  {
    template_id: 'tpl_general',
    template_name: 'Fitness General',
    description: 'Formulario completo para clientes de fitness general',
    modules: DEFAULT_MODULES.map(m => m.id), // todos activos
  },
  {
    template_id: 'tpl_rehabilitacion',
    template_name: 'Rehabilitación',
    description: 'Énfasis en salud, lesiones y condiciones médicas',
    modules: ['modulo_datos_personales', 'modulo_objetivos', 'modulo_salud', 'modulo_preferencias', 'modulo_adicional'],
  },
  {
    template_id: 'tpl_alto_rendimiento',
    template_name: 'Alto Rendimiento',
    description: 'Para atletas con experiencia y objetivos competitivos',
    modules: ['modulo_datos_personales', 'modulo_objetivos', 'modulo_estilo_vida', 'modulo_entrenamiento', 'modulo_salud', 'modulo_preferencias'],
  },
  {
    template_id: 'tpl_minimalista',
    template_name: 'Formulario mínimo',
    description: 'Solo lo esencial: datos, objetivos y salud',
    modules: ['modulo_datos_personales', 'modulo_objetivos', 'modulo_salud'],
  },
]

/**
 * Helper: construye la config completa de un formulario.
 * Siempre incluye intro + módulos habilitados + consentimiento al final.
 */
export function buildFormConfig({ intro = DEFAULT_INTRO, modules = DEFAULT_MODULES } = {}) {
  return {
    intro,
    modules: [...modules].sort((a, b) => a.order - b.order),
    consent: CONSENT_MODULE,
    version: 1,
    created_at: new Date().toISOString(),
  }
}
