// ============================================================
// Helpers compartidos para el sistema de planes
// ============================================================

// Letras de bloque A-Z
export const BLOCK_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
]

// Números de sub-bloque 1-10
export const BLOCK_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

// Opciones PSE
export const PSE_OPTIONS = [
  'Fácil (1-3)',
  'Moderado (4)',
  'Duro (5-6)',
  'Muy duro (7-9)',
  'Esfuerzo máx (10)',
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

// ============================================================
// Auto-numeración de bloques A1/A2 (Q7)
// ============================================================
//
// Cuando dos ejercicios comparten la misma letra dentro del mismo bloque
// strength, queremos que el "segundo" se llame automáticamente A2 (o A3, etc.)
// y herede `suggested_sets` y `rest_time` del primero (el de número 1).
//
// Regla de herencia: NO pisamos series/descanso ya cargados por el coach.
// Solo completamos los que están vacíos. Esto evita romper trabajo previo
// cuando el coach reasigna letras a mano.
// ============================================================

/**
 * Dado el array de ejercicios del bloque, el índice del ejercicio que está
 * cambiando de letra (o siendo creado) y la nueva letra deseada, devuelve
 * los patches a aplicar (block_letter, block_number, y opcionalmente
 * suggested_sets / rest_time heredados del primer ejercicio con esa letra).
 *
 * @param {Object} args
 * @param {Array<Object>} args.list - Lista completa de ejercicios del bloque.
 * @param {number} args.currentIndex - Índice del ejercicio actual en `list`.
 * @param {string} args.letter - Nueva letra deseada (A-Z) o '' para limpiar.
 * @returns {Object} patches a aplicar con onUpdateMulti.
 */
export function inheritFromFirstBlockmate({ list, currentIndex, letter }) {
  // Limpiar bloque: borrar letra y número
  if (!letter) {
    return { block_letter: '', block_number: '' }
  }

  const others = (list || []).filter(
    (ex, i) => i !== currentIndex && ex && ex.block_letter === letter
  )

  if (others.length === 0) {
    // Primer ejercicio con esta letra → arranca en 1, sin herencia
    return { block_letter: letter, block_number: '1' }
  }

  // Próximo número libre = max(números existentes) + 1, cap a 10
  const usedNumbers = others
    .map((ex) => parseInt(ex.block_number) || 0)
    .filter((n) => n > 0)
  const nextNumber = Math.min(10, (usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1)

  // Primer ejercicio del bloque (block_number=='1' por prioridad, sino el menor)
  const first =
    others.find((ex) => ex.block_number === '1') ||
    [...others].sort(
      (a, b) => (parseInt(a.block_number) || 99) - (parseInt(b.block_number) || 99)
    )[0]

  const patches = {
    block_letter: letter,
    block_number: String(nextNumber),
  }

  // Heredar series/descanso del primero SOLO si el actual los tiene vacíos.
  // No pisamos valores ya cargados por el coach.
  const current = (list || [])[currentIndex] || {}
  const isEmpty = (v) => v == null || v === ''
  if (isEmpty(current.suggested_sets) && !isEmpty(first.suggested_sets)) {
    patches.suggested_sets = first.suggested_sets
  }
  if (isEmpty(current.rest_time) && !isEmpty(first.rest_time)) {
    patches.rest_time = first.rest_time
  }

  return patches
}

/**
 * Valida si los ejercicios CON letra están agrupados consecutivamente y
 * en orden numérico ascendente dentro de cada letra.
 *
 * Reglas:
 *   - Ignora ejercicios sin letra (block_letter='').
 *   - Las letras deben aparecer en "runs" contiguos (todos los A, después
 *     todos los B, etc). Una letra no puede reaparecer después de haber
 *     cambiado a otra (A1, B1, A2 → inválido).
 *   - Dentro del run de una letra, los números deben ser ascendentes
 *     (A2, A1 → inválido; A1, A1, A2 → válido).
 *
 * @param {Array<Object>} exercises - Lista de ejercicios del bloque.
 * @returns {boolean} true si están ordenados (o si todos no tienen letra).
 */
export function isBlockOrderValid(exercises) {
  const lettered = (exercises || []).filter((e) => e && e.block_letter)
  if (lettered.length === 0) return true

  const seenLetters = new Set()
  let prevLetter = null
  let prevNumber = 0

  for (const ex of lettered) {
    const letter = ex.block_letter
    const number = parseInt(ex.block_number) || 0

    if (letter !== prevLetter) {
      // Cambio de letra: la nueva no puede haber aparecido antes
      if (seenLetters.has(letter)) return false
      if (prevLetter) seenLetters.add(prevLetter)
      prevLetter = letter
      prevNumber = number
    } else {
      // Misma letra: el número debe ser >= al anterior
      if (number < prevNumber) return false
      prevNumber = number
    }
  }
  return true
}

/**
 * Reordena los ejercicios CON letra por (letra ASC, número ASC) Y
 * compacta la numeración dentro de cada letra (1, 2, 3...) eliminando huecos.
 *
 * Ej: A1, A4, B1 → A1, A2, B1 (el A4 pasa a A2).
 *
 * Los ejercicios sin letra mantienen su slot de aparición original
 * (no se mueven). Útil para "arreglar" un bloque desordenado sin
 * desplazar lo que el coach dejó suelto a propósito.
 *
 * Aplica order_index secuencial al resultado.
 *
 * @param {Array<Object>} exercises - Lista original.
 * @returns {Array<Object>} Lista reordenada con order_index 0..n-1.
 */
export function reorderByBlockmate(exercises) {
  const list = exercises || []

  // Slots ocupados por sin-letra (se preservan)
  const unletteredSlots = new Set()
  const lettered = []
  list.forEach((ex, i) => {
    if (ex && ex.block_letter) {
      lettered.push(ex)
    } else {
      unletteredSlots.add(i)
    }
  })

  // Orden estable por (letra, número)
  const sortedLettered = [...lettered].sort((a, b) => {
    if (a.block_letter !== b.block_letter) {
      return a.block_letter.localeCompare(b.block_letter)
    }
    return (parseInt(a.block_number) || 0) - (parseInt(b.block_number) || 0)
  })

  // Compactar números dentro de cada letra (1, 2, 3... sin huecos)
  const counterByLetter = {}
  const compactedLettered = sortedLettered.map((ex) => {
    counterByLetter[ex.block_letter] = (counterByLetter[ex.block_letter] || 0) + 1
    return { ...ex, block_number: String(counterByLetter[ex.block_letter]) }
  })

  const result = []
  let cursor = 0
  for (let i = 0; i < list.length; i++) {
    if (unletteredSlots.has(i)) {
      result.push(list[i])
    } else {
      result.push(compactedLettered[cursor++])
    }
  }

  return result.map((ex, i) => ({ ...ex, order_index: i }))
}

/**
 * Detecta si dentro de alguna letra hay huecos de numeración
 * (ej: A1, A4 → falta A2 y A3).
 *
 * Si una letra usa los números 1..N consecutivos (en cualquier orden),
 * no hay gaps. Si falta algún número intermedio o el primero no es 1,
 * hay gap.
 *
 * @param {Array<Object>} exercises
 * @returns {boolean}
 */
export function hasNumberGaps(exercises) {
  const lettered = (exercises || []).filter((e) => e && e.block_letter)
  if (lettered.length === 0) return false

  const byLetter = {}
  for (const ex of lettered) {
    const n = parseInt(ex.block_number) || 0
    if (n < 1) continue
    byLetter[ex.block_letter] = byLetter[ex.block_letter] || []
    byLetter[ex.block_letter].push(n)
  }

  for (const letter of Object.keys(byLetter)) {
    const nums = byLetter[letter].sort((a, b) => a - b)
    // Esperamos 1, 2, 3... (en cualquier orden de aparición, pero sin huecos)
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] !== i + 1) return true
    }
  }
  return false
}

/**
 * Cuenta cuántos ejercicios del bloque NO tienen letra asignada.
 * @param {Array<Object>} exercises
 * @returns {number}
 */
export function countUnlettered(exercises) {
  return (exercises || []).filter((e) => e && !e.block_letter).length
}

// Parsear reps: puede ser string simple, JSON array, o ya un array (jsonb)
export function parseReps(repsValue) {
  if (repsValue == null || repsValue === '') return []
  // Si ya viene como array (caso jsonb de Postgres), lo devolvemos tal cual
  if (Array.isArray(repsValue)) return repsValue
  try {
    const parsed = JSON.parse(repsValue)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return [repsValue] // wrap single value in array for display
}

// ============================================================
// MODOS DE PESO (handoff 2.4)
// ============================================================
//
// 3 modos por log:
//   - 'with_weight'  → Con peso (default histórico)
//   - 'barbell_only' → Solo con barra olímpica (peso = ~20kg implícito)
//   - 'bodyweight'   → Sin peso (ejercicios de peso corporal puro)
//
// Herencia: log.weight_mode ?? plan_exercise.weight_mode ?? exercise.default_weight_mode ?? 'with_weight'
// ============================================================

export const WEIGHT_MODES = [
  {
    key: 'with_weight',
    label: 'Con peso',
    short: 'Con peso',
    description: 'Hay peso explícito (discos, mancuernas, kettlebell).',
    showsWeightInputs: true,
  },
  {
    key: 'barbell_only',
    label: 'Solo con barra',
    short: 'Solo barra',
    description: 'Ejercicio con barra olímpica sin discos extra (~20kg).',
    showsWeightInputs: true,
  },
  {
    key: 'bodyweight',
    label: 'Sin peso',
    short: 'BW',
    description: 'Peso corporal puro (push up, plancha, chin up, etc.).',
    showsWeightInputs: false,
  },
]

export const WEIGHT_MODE_BY_KEY = WEIGHT_MODES.reduce((acc, m) => {
  acc[m.key] = m
  return acc
}, {})

// reps_unit válidos según CHECK constraint del back
export const REPS_UNITS = [
  { key: 'reps', label: 'reps', short: 'reps' },
  { key: 'pasos', label: 'pasos', short: 'pasos' },
  { key: 'respiraciones', label: 'respiraciones', short: 'resp.' },
  { key: 'segundos', label: 'segundos', short: 'seg' },
]

/**
 * Resuelve el modo efectivo del peso para un log/plan_exercise/exercise,
 * siguiendo la herencia: log > plan_exercise > exercise > default.
 *
 * @param {Object} sources - { log, planExercise, exercise }
 * @returns {string} 'with_weight' | 'barbell_only' | 'bodyweight'
 */
export function getEffectiveWeightMode({ log, planExercise, exercise } = {}) {
  if (log?.weight_mode) return log.weight_mode
  if (planExercise?.weight_mode) return planExercise.weight_mode
  if (exercise?.default_weight_mode) return exercise.default_weight_mode
  return 'with_weight'
}

/**
 * Resuelve si es unilateral (cada lado), siguiendo herencia.
 *
 * @param {Object} sources - { log, planExercise, exercise }
 * @returns {boolean}
 */
export function getEffectiveUnilateral({ log, planExercise, exercise } = {}) {
  if (log?.unilateral != null) return !!log.unilateral
  if (planExercise?.unilateral != null) return !!planExercise.unilateral
  if (exercise?.default_unilateral != null) return !!exercise.default_unilateral
  return false
}

/**
 * Lee el array de reps desde un log priorizando el formato nuevo (jsonb)
 * y cayendo al viejo (text con JSON) por retrocompat.
 *
 * @param {Object} log - workout_log fila
 * @returns {Array<number|string>} array de reps (puede tener strings de logs sucios)
 */
export function readLogReps(log) {
  if (!log) return []
  if (Array.isArray(log.actual_reps_jsonb)) return log.actual_reps_jsonb
  return parseReps(log.actual_reps)
}

/**
 * Lee el array de pesos desde un log priorizando jsonb sobre formato viejo.
 *
 * @param {Object} log
 * @returns {Array<number|null>}
 */
export function readLogWeights(log) {
  if (!log) return []
  if (Array.isArray(log.actual_weights_jsonb)) return log.actual_weights_jsonb
  const fromText = parseReps(log.actual_weights)
  if (fromText.length > 0) return fromText
  // Último fallback: actual_weight legacy (numeric, replicado a todas las series)
  if (log.actual_weight != null) {
    const sets = parseInt(log.actual_sets) || 1
    return Array(sets).fill(log.actual_weight)
  }
  return []
}

/**
 * Peso máximo de un log (con todos los fallbacks).
 * Usar para gráficos de "Peso máximo registrado".
 */
export function maxWeightOfLog(log) {
  const arr = readLogWeights(log)
  const nums = arr.map((w) => parseFloat(w)).filter((n) => !isNaN(n) && n > 0)
  return nums.length > 0 ? Math.max(...nums) : 0
}

/**
 * Peso promedio de un log (para gráficos de volumen aproximado).
 */
export function avgWeightOfLog(log) {
  const arr = readLogWeights(log)
  const nums = arr.map((w) => parseFloat(w)).filter((n) => !isNaN(n) && n > 0)
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

/**
 * Calcula el volumen de un log en el cliente, respetando weight_mode + unilateral.
 *
 *   with_weight / barbell_only: sum(reps[i] × weights[i]) [× 2 si unilateral]
 *   bodyweight:                 sum(reps[i]) × bodyWeightKg [× 2 si unilateral]
 *                               → devuelve null si no hay bodyWeightKg
 *
 * El back ofrece la RPC calculate_log_volume(p_log_id) con la lógica oficial.
 * Esta función es el equivalente cliente para evitar 1 RTT por log en gráficos.
 *
 * @param {Object} log - workout_log (con weight_mode, unilateral resueltos efectivos)
 * @param {number} bodyWeightKg - profile.weight_kg del alumno (puede ser null)
 * @param {Object} [opts] - { weightMode, unilateral } overrides (resueltos efectivos)
 * @returns {number|null}  numeric o null si no se puede calcular
 */
export function calculateLogVolume(log, bodyWeightKg, opts = {}) {
  if (!log) return 0
  const reps = readLogReps(log)
    .map((r) => parseFloat(r))
    .filter((n) => !isNaN(n) && n > 0)
  if (reps.length === 0) return 0

  const weightMode = opts.weightMode || log.weight_mode || 'with_weight'
  const unilateral = opts.unilateral != null ? !!opts.unilateral : !!log.unilateral
  const multiplier = unilateral ? 2 : 1

  if (weightMode === 'bodyweight') {
    if (!bodyWeightKg || bodyWeightKg <= 0) return null
    const totalReps = reps.reduce((a, b) => a + b, 0)
    return totalReps * bodyWeightKg * multiplier
  }

  const weights = readLogWeights(log).map((w) => parseFloat(w))
  // Pareamos cada serie con su peso (o el primer peso si falta)
  const fallback = weights.find((n) => !isNaN(n) && n > 0) || 0
  let vol = 0
  for (let i = 0; i < reps.length; i++) {
    const w = !isNaN(weights[i]) && weights[i] > 0 ? weights[i] : fallback
    vol += reps[i] * w
  }
  return vol * multiplier
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
    suggested_weights_array: [''], // peso por serie
    suggested_weight: '', // legacy: retrocompat
    rest_time: '',
    suggested_pse: '',
    extra_notes: '',
    video_url: '',
    order_index: 0,
    // Overrides del plan_exercise sobre el catálogo. null = hereda del exercise.
    weight_mode: null,
    unilateral: null,
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
    // Overrides del plan_exercise. null = hereda del exercise.
    weight_mode: ex.weight_mode ?? null,
    unilateral: ex.unilateral ?? null,
  }
}

// Convertir de UI a formato para insertar/update en DB
export function uiExToDBEx(ex, planId, section, index, blockId = null) {
  // Serializar pesos por serie
  const weightsArr = ex.suggested_weights_array || []
  const serializedWeights = serializeReps(weightsArr) || null
  // suggested_weight (legacy): primer peso válido del array para retrocompat
  const firstWeight = weightsArr.find((w) => w !== '' && w !== null && w !== undefined)
  const legacyWeight = firstWeight != null ? String(firstWeight) : ex.suggested_weight || null

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
    suggested_weight: legacyWeight, // legacy: primer peso (retrocompat)
    rest_time: ex.rest_time || null,
    suggested_pse: ex.suggested_pse || null,
    extra_notes: ex.extra_notes || null,
    exercise_mode: ex.exercise_mode || 'reps',
    duration_seconds: ex.duration_seconds ? parseInt(ex.duration_seconds) : null,
    // Overrides del plan_exercise (NULL = hereda del exercise)
    weight_mode: ex.weight_mode ?? null,
    unilateral: ex.unilateral == null ? null : !!ex.unilateral,
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
// NOTA: HIIT se modela ahora siempre como un BLOQUE CIRCUITO (ver CIRCUIT_TYPES),
// no como formato aeróbico. Para mantener compatibilidad con bloques antiguos
// que pudieran venir como aerobic_format='hiit' desde la base, lo tratamos
// como 'intervals' a nivel UI (el migration v19 ya los actualiza).
export const AEROBIC_FORMATS = [
  { key: 'continuous', label: 'Continuo', description: 'Ritmo sostenido' },
  { key: 'intervals', label: 'Intervalos', description: 'Trabajo / descanso' },
  { key: 'progressive', label: 'Progresivo', description: 'Sube de intensidad' },
]

// Formatos aeróbicos que requieren work/rest/rounds
export const AEROBIC_INTERVAL_FORMATS = ['intervals']

// Tipos de circuito
export const CIRCUIT_TYPES = [
  { key: 'hiit', label: 'HIIT', description: 'Trabajo / descanso / rondas' },
  { key: 'amrap', label: 'AMRAP', description: 'Tantas rondas como puedas' },
  { key: 'emom', label: 'EMOM', description: 'Cada minuto al minuto' },
  { key: 'free', label: 'Libre', description: 'Sin estructura fija' },
]

// Intensidad (común entre aeróbico y circuito)
export const INTENSITY_LEVELS = [
  { key: 'soft', label: 'Suave', color: 'bg-green-100 text-green-700' },
  { key: 'moderate', label: 'Moderado', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'intense', label: 'Intenso', color: 'bg-red-100 text-red-700' },
]

// Zonas aeróbicas (RPE Cardio con talk test)
// Z1 = recuperación / muy suave  · Z5 = máximo / segundos
export const AEROBIC_ZONES = [
  {
    key: 'Z1',
    label: 'Z1',
    range: 'RPE 1–2',
    pct: '50–60%',
    short: 'muy suave',
    desc: 'podés cantar · respiración nasal',
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  {
    key: 'Z2',
    label: 'Z2',
    range: 'RPE 3–4',
    pct: '60–70%',
    short: 'leve / moderado bajo',
    desc: 'frases completas · cómodo',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  {
    key: 'Z3',
    label: 'Z3',
    range: 'RPE 5–6',
    pct: '70–80%',
    short: 'moderado',
    desc: 'frases con pausas · sostenido',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  {
    key: 'Z4',
    label: 'Z4',
    range: 'RPE 7',
    pct: '80–85%',
    short: 'alto',
    desc: '2–3 palabras · foco mental',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  {
    key: 'Z5',
    label: 'Z5',
    range: 'RPE 8–10',
    pct: '85–100%',
    short: 'muy alto / máximo',
    desc: 'no podés hablar · al límite',
    color: 'bg-red-100 text-red-700 border-red-200',
  },
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
    return strengthIndexInSection > 0 ? `Fuerza ${strengthIndexInSection + 1}` : 'Fuerza'
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
    exercises: [], // array de plan_exercise en formato UI
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
    exercises: [], // puede tener 0-1 ejercicio asociado (dropdown)
    aerobic_format: 'continuous',
    aerobic_total_minutes: '',
    aerobic_intensity: 'moderate',
    aerobic_zone: 'Z2', // obligatorio: zona objetivo (talk test)
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
    exercise_mode: 'reps', // 'reps' | 'time'
    suggested_reps_array: [''], // cuando es por reps (1 valor típicamente)
    suggested_weights_array: [''],
    suggested_sets: '1', // los circuitos casi siempre son 1 set por ejercicio
    duration_seconds: '', // cuando es por tiempo
    rest_time: '',
    block_letter: '',
    block_number: '',
    extra_notes: '',
    order_index: 0,
    // null = hereda del exercise (handoff 2.4)
    weight_mode: null,
    unilateral: null,
  }
}

// ============================================================
// Conversión DB ↔ UI para bloques
// ============================================================
export function dbBlockToUI(block, exercisesDb = []) {
  const exercises = (exercisesDb || [])
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .map((e) => {
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
    // HIIT como formato aeróbico fue eliminado (v19). Si aparece en la base
    // por algún motivo, lo mostramos como 'intervals' (que es funcionalmente equivalente).
    aerobic_format:
      (block.aerobic_format === 'hiit' ? 'intervals' : block.aerobic_format) || 'continuous',
    aerobic_total_minutes:
      block.aerobic_total_minutes != null ? String(block.aerobic_total_minutes) : '',
    aerobic_intensity: block.aerobic_intensity || 'moderate',
    aerobic_zone: block.aerobic_zone || 'Z2',
    aerobic_work_seconds:
      block.aerobic_work_seconds != null ? String(block.aerobic_work_seconds) : '',
    aerobic_rest_seconds:
      block.aerobic_rest_seconds != null ? String(block.aerobic_rest_seconds) : '',
    aerobic_rounds: block.aerobic_rounds != null ? String(block.aerobic_rounds) : '',
    aerobic_expected_sensation: block.aerobic_expected_sensation || '',
    circuit_type: block.circuit_type || 'hiit',
    circuit_work_seconds:
      block.circuit_work_seconds != null ? String(block.circuit_work_seconds) : '',
    circuit_rest_seconds:
      block.circuit_rest_seconds != null ? String(block.circuit_rest_seconds) : '',
    circuit_rounds: block.circuit_rounds != null ? String(block.circuit_rounds) : '',
    circuit_total_minutes:
      block.circuit_total_minutes != null ? String(block.circuit_total_minutes) : '',
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
    aerobic_zone: null,
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
    base.aerobic_zone = block.aerobic_zone || 'Z2'
    base.aerobic_total_minutes = block.aerobic_total_minutes
      ? parseInt(block.aerobic_total_minutes)
      : null
    base.aerobic_expected_sensation = block.aerobic_expected_sensation || null
    if (AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)) {
      base.aerobic_work_seconds = block.aerobic_work_seconds
        ? parseInt(block.aerobic_work_seconds)
        : null
      base.aerobic_rest_seconds = block.aerobic_rest_seconds
        ? parseInt(block.aerobic_rest_seconds)
        : null
      base.aerobic_rounds = block.aerobic_rounds ? parseInt(block.aerobic_rounds) : null
    }
  }

  if (block.block_type === 'circuit') {
    base.circuit_type = block.circuit_type || 'hiit'
    base.circuit_intensity = block.circuit_intensity || null
    if (block.circuit_type === 'hiit') {
      base.circuit_work_seconds = block.circuit_work_seconds
        ? parseInt(block.circuit_work_seconds)
        : null
      base.circuit_rest_seconds = block.circuit_rest_seconds
        ? parseInt(block.circuit_rest_seconds)
        : null
      base.circuit_rounds = block.circuit_rounds ? parseInt(block.circuit_rounds) : null
    } else if (block.circuit_type === 'amrap' || block.circuit_type === 'emom') {
      base.circuit_total_minutes = block.circuit_total_minutes
        ? parseInt(block.circuit_total_minutes)
        : null
    }
  }

  return base
}

// ============================================================
// Día sugerido para el alumno
// ============================================================

/**
 * Devuelve el día sugerido para entrenar hoy.
 *
 * Reglas:
 *   1. Si la fecha más reciente con logs es HOY → ese mismo día (sigue cargando).
 *   2. Si la fecha más reciente es anterior a hoy → el día siguiente al último entrenado (cíclico).
 *   3. Si nunca entrenó → primer día disponible (típicamente day_a).
 *
 * @param {string[]} activeDays      Array de section ids con contenido (['day_a', 'day_b', ...]).
 * @param {Array<{logged_date: string, plan_exercise_id: string}>} logs  Logs del plan (recientes).
 * @param {Object<string,string>} exSection  Map plan_exercise_id → section ('day_a', 'activation', etc.).
 * @param {string} today             Fecha de hoy en formato 'yyyy-MM-dd'.
 * @returns {string|null}            ID del día sugerido (ej: 'day_b') o null si no hay días activos.
 */
export function suggestNextDay(activeDays, logs, exSection, today) {
  if (!activeDays || activeDays.length === 0) return null
  if (!logs || logs.length === 0) return activeDays[0]

  // Fechas con logs, ordenadas de más reciente a más vieja.
  const datesDesc = [...new Set(logs.map((l) => l.logged_date))].sort((a, b) => b.localeCompare(a))

  // Para una fecha dada, devuelve el day_* con más logs (excluye 'activation').
  function dayOfDate(date) {
    const counts = {}
    for (const l of logs) {
      if (l.logged_date !== date) continue
      const sec = exSection[l.plan_exercise_id]
      if (sec && sec.startsWith('day_') && activeDays.includes(sec)) {
        counts[sec] = (counts[sec] || 0) + 1
      }
    }
    let best = null,
      bestCount = 0
    for (const [sec, c] of Object.entries(counts)) {
      if (c > bestCount) {
        best = sec
        bestCount = c
      }
    }
    return best
  }

  // 1. Si hay logs de hoy → quedarse en ese día.
  if (datesDesc[0] === today) {
    const todayDay = dayOfDate(today)
    if (todayDay) return todayDay
  }

  // 2. Buscar la última fecha < hoy con un day_* identificable.
  for (const d of datesDesc) {
    if (d >= today) continue
    const day = dayOfDate(d)
    if (day) {
      const idx = activeDays.indexOf(day)
      if (idx === -1) return activeDays[0]
      return activeDays[(idx + 1) % activeDays.length]
    }
  }

  // 3. Fallback.
  return activeDays[0]
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
  return [...realBlocks, ...virtualBlocks].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )
}
