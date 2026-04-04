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
    suggested_weight: '',
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

  return {
    id: ex.id, // existing DB id, used for updates
    exercise_id: ex.exercise_id,
    block_letter: letter,
    block_number: number,
    suggested_sets: ex.suggested_sets?.toString() || '',
    suggested_reps_array: repsArray,
    suggested_weight: ex.suggested_weight || '',
    rest_time: ex.rest_time || '',
    suggested_pse: ex.suggested_pse || '',
    extra_notes: ex.extra_notes || '',
    video_url: ex.exercise?.video_url || '',
    order_index: ex.order_index || 0,
  }
}

// Convertir de UI a formato para insertar/update en DB
export function uiExToDBEx(ex, planId, section, index) {
  return {
    plan_id: planId,
    exercise_id: ex.exercise_id,
    section,
    block_label: makeBlockLabel(ex.block_letter, ex.block_number) || null,
    order_index: index,
    suggested_sets: ex.suggested_sets ? parseInt(ex.suggested_sets) : null,
    suggested_reps: serializeReps(ex.suggested_reps_array) || null,
    suggested_weight: ex.suggested_weight || null,
    rest_time: ex.rest_time || null,
    suggested_pse: ex.suggested_pse || null,
    extra_notes: ex.extra_notes || null,
  }
}
