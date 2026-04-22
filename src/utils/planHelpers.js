// ============================================================
// Helpers compartidos para el sistema de planes
// ============================================================

// Letras de bloque A-Z
export const BLOCK_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

// Números de sub-bloque 1-10
export const BLOCK_NUMBERS = ['1','2','3','4','5','6','7','8','9','10']

// Opciones PSE
export const PSE_OPTIONS = [
  'Fácil (1-3)', 'Moderado (4)', 'Duro (5-6)', 'Muy duro (7-9)', 'Esfuerzo máx (10)'
]

// Borg 0-10 para evaluación general del entrenamiento
export const BORG_LABELS = {
  0: 'Nada',
  1: 'Muy, muy suave',
  2: 'Muy suave',
  3: 'Suave',
  4: 'Moderado',
  5: 'Algo duro',
  6: 'Duro',
  7: 'Muy duro',
  8: 'Muy, muy duro',
  9: 'Casi máximo',
  10: 'Máximo (fallo)',
}

// Parsear block_label "A1" → { letter: "A", number: "1" }
export function parseBlockLabel(label) {
  if (!label) return { letter: '', number: '' }
  const match = label.match(/^([A-Z])(\d+)$/)
  if (match) return { letter: match[1], number: match[2] }
  return { letter: '', number: '' }
}

// Crear block_label desde letter + number
export function makeBlockLabel(letter, number) {
  if (!letter) return ''
  if (!number) return letter
  return `${letter}${number}`
}

// Parsear reps: puede ser string simple o JSON array
export function parseReps(repsValue) {
  if (!repsValue) return []
  try {
    const parsed = JSON.parse(repsValue)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return [repsValue] // wrap single value in array for display
}

// Serializar reps: si todas son iguales o solo hay una → string simple
export function serializeReps(repsArray) {
  if (!repsArray || repsArray.length === 0) return ''
  if (repsArray.length === 1) return repsArray[0]
  const unique = [...new Set(repsArray.filter(Boolean))]
  if (unique.length === 1) return unique[0] // todos iguales → string simple
  return JSON.stringify(repsArray)
}

// Mostrar reps para el resumen (human readable)
export function displayReps(repsValue) {
  if (!repsValue) return ''
  try {
    const parsed = JSON.parse(repsValue)
    if (Array.isArray(parsed)) return parsed.join(', ')
  } catch {}
  return repsValue
}

// Crear array de reps vacíos según número de series
export function createRepsArray(sets) {
  const n = parseInt(sets) || 0
  return Array(n).fill('')
}

// Color de BORG según valor
export function borgColor(val) {
  if (val === null || val === undefined) return 'bg-gray-100 text-gray-500'
  if (val >= 8) return 'bg-red-500 text-white'
  if (val >= 6) return 'bg-orange-400 text-white'
  if (val >= 4) return 'bg-yellow-400 text-gray-900'
  return 'bg-green-500 text-white'
}

// ============================================================
// SISTEMA DE SECCIONES DINÁMICAS
// ============================================================

// IDs de secciones por día (máximo 7)
export const DAY_SECTION_IDS = ['day_a', 'day_b', 'day_c', 'day_d', 'day_e', 'day_f', 'day_g']

// Labels de todas las secciones posibles
export const SECTION_LABELS = {
  activation: 'Activación',
  day_a: 'Principal Día A',
  day_b: 'Principal Día B',
  day_c: 'Principal Día C',
  day_d: 'Principal Día D',
  day_e: 'Principal Día E',
  day_f: 'Principal Día F',
  day_g: 'Principal Día G',
}

/**
 * Genera las secciones activas según la configuración del plan.
 * @param {number|string} sessionsPerWeek - Días por semana (1–7)
 * @param {boolean} hasActivation - Si incluye bloque de Activación
 * @returns {Array<{id: string, label: string}>}
 */
export function getDynamicSections(sessionsPerWeek, hasActivation) {
  const n = Math.max(1, Math.min(7, parseInt(sessionsPerWeek) || 1))
  const sections = []
  if (hasActivation) {
    sections.push({ id: 'activation', label: 'Activación' })
  }
  for (let i = 0; i < n; i++) {
    const id = DAY_SECTION_IDS[i]
    sections.push({ id, label: SECTION_LABELS[id] })
  }
  return sections
}

// Secciones fijas (retrocompatibilidad — preferir getDynamicSections)
export const SECTIONS = [
  { id: 'activation', label: 'Activación' },
  { id: 'day_a', label: 'Principal Día A' },
  { id: 'day_b', label: 'Principal Día B' },
]

// Crear ejercicio vacío para el plan
export function emptyPlanExercise(section) {
  return {
    exercise_id: '',
    block_letter: section === 'activation' ? '' : 'A',
    block_number: section === 'activation' ? '' : '1',
    suggested_sets: '',
    suggested_reps_array: [''],
    suggested_weights_array: [''],  // peso por serie
    suggested_weight: '',           // legacy: retrocompat
    rest_time: '',
    suggested_pse: '',
    extra_notes: '',
    video_url: '',
    order_index: 0,
  }
}

// Convertir un planExercise de DB a formato de UI
export function dbExToUIEx(ex) {
  const { letter, number } = parseBlockLabel(ex.block_label)
  const setsCount = parseInt(ex.suggested_sets) || 1

  // Parsear reps array
  let repsArray
  try {
    const parsed = JSON.parse(ex.suggested_reps)
    if (Array.isArray(parsed)) {
      repsArray = parsed
    } else {
      repsArray = Array(setsCount).fill(ex.suggested_reps || '')
    }
  } catch {
    repsArray = Array(setsCount).fill(ex.suggested_reps || '')
  }

  // Parsear pesos por serie
  // Prioridad: suggested_weights (array) → fallback a suggested_weight (legacy)
  let weightsArray
  const legacyWeight = ex.suggested_weight
    ? String(ex.suggested_weight).replace(/[^\d.]/g, '') || ex.suggested_weight
    : ''
  try {
    const parsed = JSON.parse(ex.suggested_weights)
    if (Array.isArray(parsed)) {
      weightsArray = parsed
    } else {
      weightsArray = Array(setsCount).fill(ex.suggested_weights || legacyWeight)
    }
  } catch {
    // Sin suggested_weights: usar suggested_weight como valor base para todas las series
    weightsArray = Array(setsCount).fill(legacyWeight)
  }

  return {
    id: ex.id, // existing DB id, used for updates
    exercise_id: ex.exercise_id,
    block_letter: letter,
    block_number: number,
    suggested_sets: ex.suggested_sets?.toString() || '',
    suggested_reps_array: repsArray,
    suggested_weights_array: weightsArray, // peso por serie
    suggested_weight: ex.suggested_weight || '', // legacy: mantenido para retrocompat
    rest_time: ex.rest_time || '',
    suggested_pse: ex.suggested_pse || '',
    extra_notes: ex.extra_notes || '',
    video_url: ex.exercise?.video_url || '',
    order_index: ex.order_index || 0,
  }
}

// Convertir de UI a formato para insertar/update en DB
export function uiExToDBEx(ex, planId, section, index, blockId = null) {
  // Serializar pesos por serie
  const weightsArr = ex.suggested_weights_array || []
  const serializedWeights = serializeReps(weightsArr) || null
  // suggested_weight (legacy): primer peso válido del array para retrocompat
  const firstWeight = weightsArr.find(w => w !== '' && w !== null && w !== undefined)
  const legacyWeight = firstWeight != null ? String(firstWeight) : (ex.suggested_weight || null)

  return {
    plan_id: planId,
    exercise_id: ex.exercise_id,
    section,
    block_id: blockId,
    block_label: makeBlockLabel(ex.block_letter, ex.block_number) || null,
    order_index: index,
    suggested_sets: ex.suggested_sets ? parseInt(ex.suggested_sets) : null,
    suggested_reps: serializeReps(ex.suggested_reps_array) || null,
    suggested_weights: serializedWeights, // nuevo: array de pesos por serie
    suggested_weight: legacyWeight,       // legacy: primer peso (retrocompat)
    rest_time: ex.rest_time || null,
    suggested_pse: ex.suggested_pse || null,
    extra_notes: ex.extra_notes || null,
    exercise_mode: ex.exercise_mode || 'reps',
    duration_seconds: ex.duration_seconds ? parseInt(ex.duration_seconds) : null,
  }
}

// ============================================================
// SISTEMA DE BLOQUES (strength / aerobic / circuit)
// ============================================================

// Tipos de bloque disponibles
export const BLOCK_TYPES = {
  strength: {
    key: 'strength',
    label: 'Fuerza',
    icon: '💪',
    color: 'primary',
    description: 'Series, reps y peso. Formato clásico.',
  },
  aerobic: {
    key: 'aerobic',
    label: 'Aeróbico',
    icon: '🏃',
    color: 'sky',
    description: 'Cardio: duración, intensidad, intervalos.',
  },
  circuit: {
    key: 'circuit',
    label: 'Circuito',
    icon: '🔥',
    color: 'orange',
    description: 'HIIT / AMRAP / EMOM / libre con varios ejercicios.',
  },
}

export const BLOCK_TYPE_LIST = Object.values(BLOCK_TYPES)

// Formatos aeróbicos
export const AEROBIC_FORMATS = [
  { key: 'continuous',  label: 'Continuo',      description: 'Ritmo sostenido' },
  { key: 'intervals',   label: 'Intervalos',    description: 'Trabajo / descanso' },
  { key: 'hiit',        label: 'HIIT',          description: 'Alta intensidad, picos' },
  { key: 'progressive', label: 'Progresivo',    description: 'Sube de intensidad' },
]

// Formatos aeróbicos que requieren work/rest/rounds
export const AEROBIC_INTERVAL_FORMATS = ['intervals', 'hiit']

// Tipos de circuito
export const CIRCUIT_TYPES = [
  { key: 'hiit',  label: 'HIIT',  description: 'Trabajo / descanso / rondas' },
  { key: 'amrap', label: 'AMRAP', description: 'Tantas rondas como puedas' },
  { key: 'emom', label: 'EMOM',  description: 'Cada minuto al minuto' },
  { key: 'free', label: 'Libre', description: 'Sin estructura fija' },
]

// Intensidad (común entre aeróbico y circuito)
export const INTENSITY_LEVELS = [
  { key: 'soft',     label: 'Suave',    color: 'bg-green-100 text-green-700' },
  { key: 'moderate', label: 'Moderado', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'intense',  label: 'Intenso',  color: 'bg-red-100 text-red-700' },
]

// Modos de ejercicio dentro de circuito
export const EXERCISE_MODES = [
  { key: 'reps', label: 'Por reps' },
  { key: 'time', label: 'Por tiempo' },
]

// Etiquetas de bloque
export function blockTypeLabel(type) {
  return BLOCK_TYPES[type]?.label || 'Bloque'
}

export function blockTypeIcon(type) {
  return BLOCK_TYPES[type]?.icon || '📦'
}

// Genera un título legible para el bloque ("Fuerza A", "Aeróbico", etc.)
export function blockDisplayTitle(block, strengthIndexInSection = 0) {
  if (block.title) return block.title
  if (block.block_type === 'strength') {
    return strengthIndexInSection > 0
      ? `Fuerza ${strengthIndexInSection + 1}`
      : 'Fuerza'
  }
  return blockTypeLabel(block.block_type)
}

// ============================================================
// Constructores de bloques vacíos por tipo
// ============================================================
export function emptyStrengthBlock(section, order = 0) {
  return {
    id: null,
    plan_id: null,
    section,
    block_type: 'strength',
    order_index: order,
    title: '',
    notes: '',
    exercises: [],                 // array de plan_exercise en formato UI
    // campos aeróbico/circuito no aplican
  }
}

export function emptyAerobicBlock(section, order = 0) {
  return {
    id: null,
    plan_id: null,
    section,
    block_type: 'aerobic',
    order_index: order,
    title: '',
    notes: '',
    exercises: [],                 // puede tener 0-1 ejercicio asociado (dropdown)
    aerobic_format: 'continuous',
    aerobic_total_minutes: '',
    aerobic_intensity: 'moderate',
    aerobic_work_seconds: '',
    aerobic_rest_seconds: '',
    aerobic_rounds: '',
    aerobic_expected_sensation: '',
  }
}

export function emptyCircuitBlock(section, order = 0) {
  return {
    id: null,
    plan_id: null,
    section,
    block_type: 'circuit',
    order_index: order,
    title: '',
    notes: '',
    exercises: [],
    circuit_type: 'hiit',
    circuit_work_seconds: '',
    circuit_rest_seconds: '',
    circuit_rounds: '',
    circuit_total_minutes: '',
    circuit_intensity: 'moderate',
  }
}

export function emptyBlock(type, section, order = 0) {
  if (type === 'aerobic') return emptyAerobicBlock(section, order)
  if (type === 'circuit') return emptyCircuitBlock(section, order)
  return emptyStrengthBlock(section, order)
}

// Ejercicio vacío dentro de un circuito (por defecto por reps)
export function emptyCircuitExercise() {
  return {
    id: null,
    exercise_id: '',
    exercise_mode: 'reps',       // 'reps' | 'time'
    suggested_reps_array: [''],  // cuando es por reps (1 valor típicamente)
    suggested_weights_array: [''],
    suggested_sets: '1',         // los circuitos casi siempre son 1 set por ejercicio
    duration_seconds: '',        // cuando es por tiempo
    rest_time: '',
    block_letter: '',
    block_number: '',
    extra_notes: '',
    order_index: 0,
  }
}

// ============================================================
// Conversión DB ↔ UI para bloques
// ============================================================
export function dbBlockToUI(block, exercisesDb = []) {
  const exercises = (exercisesDb || [])
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .map(e => {
      const ui = dbExToUIEx(e)
      ui.exercise_mode = e.exercise_mode || 'reps'
      ui.duration_seconds = e.duration_seconds != null ? String(e.duration_seconds) : ''
      return ui
    })

  return {
    id: block.id,
    plan_id: block.plan_id,
    section: block.section,
    block_type: block.block_type,
    order_index: block.order_index ?? 0,
    title: block.title || '',
    notes: block.notes || '',
    aerobic_format: block.aerobic_format || 'continuous',
    aerobic_total_minutes: block.aerobic_total_minutes != null ? String(block.aerobic_total_minutes) : '',
    aerobic_intensity: block.aerobic_intensity || 'moderate',
    aerobic_work_seconds: block.aerobic_work_seconds != null ? String(block.aerobic_work_seconds) : '',
    aerobic_rest_seconds: block.aerobic_rest_seconds != null ? String(block.aerobic_rest_seconds) : '',
    aerobic_rounds: block.aerobic_rounds != null ? String(block.aerobic_rounds) : '',
    aerobic_expected_sensation: block.aerobic_expected_sensation || '',
    circuit_type: block.circuit_type || 'hiit',
    circuit_work_seconds: block.circuit_work_seconds != null ? String(block.circuit_work_seconds) : '',
    circuit_rest_seconds: block.circuit_rest_seconds != null ? String(block.circuit_rest_seconds) : '',
    circuit_rounds: block.circuit_rounds != null ? String(block.circuit_rounds) : '',
    circuit_total_minutes: block.circuit_total_minutes != null ? String(block.circuit_total_minutes) : '',
    circuit_intensity: block.circuit_intensity || 'moderate',
    exercises,
  }
}

// Payload de plan_blocks listo para insert/update
export function uiBlockToDB(block, planId, index) {
  const base = {
    plan_id: planId,
    section: block.section,
    block_type: block.block_type,
    order_index: index,
    title: block.title || null,
    notes: block.notes || null,
    // aeróbico
    aerobic_format: null,
    aerobic_total_minutes: null,
    aerobic_intensity: null,
    aerobic_work_seconds: null,
    aerobic_rest_seconds: null,
    aerobic_rounds: null,
    aerobic_expected_sensation: null,
    // circuito
    circuit_type: null,
    circuit_work_seconds: null,
    circuit_rest_seconds: null,
    circuit_rounds: null,
    circuit_total_minutes: null,
    circuit_intensity: null,
  }

  if (block.block_type === 'aerobic') {
    base.aerobic_format = block.aerobic_format || 'continuous'
    base.aerobic_intensity = block.aerobic_intensity || null
    base.aerobic_total_minutes = block.aerobic_total_minutes ? parseInt(block.aerobic_total_minutes) : null
    base.aerobic_expected_sensation = block.aerobic_expected_sensation || null
    if (AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)) {
      base.aerobic_work_seconds = block.aerobic_work_seconds ? parseInt(block.aerobic_work_seconds) : null
      base.aerobic_rest_seconds = block.aerobic_rest_seconds ? parseInt(block.aerobic_rest_seconds) : null
      base.aerobic_rounds = block.aerobic_rounds ? parseInt(block.aerobic_rounds) : null
    }
  }

  if (block.block_type === 'circuit') {
    base.circuit_type = block.circuit_type || 'hiit'
    base.circuit_intensity = block.circuit_intensity || null
    if (block.circuit_type === 'hiit') {
      base.circuit_work_seconds = block.circuit_work_seconds ? parseInt(block.circuit_work_seconds) : null
      base.circuit_rest_seconds = block.circuit_rest_seconds ? parseInt(block.circuit_rest_seconds) : null
      base.circuit_rounds = block.circuit_rounds ? parseInt(block.circuit_rounds) : null
    } else if (block.circuit_type === 'amrap' || block.circuit_type === 'emom') {
      base.circuit_total_minutes = block.circuit_total_minutes ? parseInt(block.circuit_total_minutes) : null
    }
  }

  return base
}

// ============================================================
// Retrocompat: agrupar plan_exercises "sueltos" (sin block_id)
// en un bloque strength virtual por sección.
// ============================================================
export function groupExercisesIntoBlocks(planExercises = [], planBlocks = []) {
  // Indexar bloques por id
  const blocksById = {}
  for (const b of planBlocks) blocksById[b.id] = { ...b, plan_exercises: [] }

  // Agrupar ejercicios por block_id
  const orphansBySection = {}
  for (const ex of planExercises) {
    if (ex.block_id && blocksById[ex.block_id]) {
      blocksById[ex.block_id].plan_exercises.push(ex)
    } else if (ex.section) {
      // ejercicio huérfano (planes viejos sin migrar): crear bloque virtual
      const key = ex.section
      if (!orphansBySection[key]) {
        orphansBySection[key] = {
          id: `virtual-${ex.section}`,
          plan_id: ex.plan_id,
          section: ex.section,
          block_type: 'strength',
          order_index: 0,
          title: null,
          plan_exercises: [],
          __virtual: true,
        }
      }
      orphansBySection[key].plan_exercises.push(ex)
    }
  }

  const virtualBlocks = Object.values(orphansBySection)
  const realBlocks = Object.values(blocksById)
  return [...realBlocks, ...virtualBlocks]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}
