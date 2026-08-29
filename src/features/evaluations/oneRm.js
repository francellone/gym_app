// ============================================================
// Resolvedor de 1RM y de kilos derivados (%RM)
// ------------------------------------------------------------
// Pieza compartida entre las dos puntas de la función %RM:
//   · el coach, al previsualizar una plantilla "como [alumna]" y al
//     asignar (quién no tiene evaluación de 1RM);
//   · la alumna, que al entrenar ve los kilos ya resueltos.
//
// REGLA DE ORO (ver doc de diseño): los kilos NUNCA se inscriben en el
// plan. Se guarda el % y el 1RM por separado y el peso se calcula al
// mostrar. Así el plan progresa solo cuando sube el máximo de la persona.
//
// El 1RM vive en DOS formas, las dos con exercise_id:
//   1. Modelo por ejercicio (doc 38/41): evaluation_test_responses
//      .student_response->>'one_rm_estimated', vía plan_exercise_id.
//   2. Modelo viejo: evaluation_results.results.exercises[] con
//      best_one_rm / one_rm y exercise_id adentro del jsonb.
// Las dos se mezclan y por ejercicio gana la evaluación MÁS RECIENTE.
// ============================================================
import { format, parseISO } from 'date-fns'
import i18n from '@/i18n'
import { dateLocale } from '@/i18n/dateLocale'
import { fetchAllRows } from '@/lib/fetchAllRows'

// Un 1RM más viejo que esto se marca (no se descarta: la coach decide).
export const ONE_RM_STALE_DAYS = 180

// Los inputs de peso de la app van de a 0.5 kg; los kilos derivados
// se redondean igual para que sean cargables tal cual.
export const WEIGHT_ROUNDING_KG = 0.5

/**
 * Redondea kilos al escalón cargable más cercano (0.5 kg).
 * @param {number} kg
 * @returns {number}
 */
export function roundWeightKg(kg) {
  return Math.round(kg / WEIGHT_ROUNDING_KG) * WEIGHT_ROUNDING_KG
}

function toNumber(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Guarda una entrada en el mapa solo si es más nueva que la que ya está.
function keepMostRecent(map, exerciseId, entry) {
  if (!exerciseId || entry.oneRm == null || entry.oneRm <= 0) return
  const prev = map.get(exerciseId)
  if (!prev || String(entry.date || '') > String(prev.date || '')) {
    map.set(exerciseId, entry)
  }
}

/**
 * Construye el mapa exercise_id → mejor 1RM vigente de UNA persona.
 *
 * @param {Object} sources
 * @param {Array} sources.responses - filas de evaluation_test_responses ya
 *        joineadas: { student_response, evaluation_result: {eval_date},
 *        plan_exercise: {exercise_id} }
 * @param {Array} sources.legacyResults - filas de evaluation_results con
 *        results.exercises[] (modelo viejo)
 * @returns {Map<string, {oneRm:number, date:string, source:string}>}
 */
export function buildOneRmMap({ responses = [], legacyResults = [] } = {}) {
  const map = new Map()

  // Modelo viejo primero: si hay una eval por ejercicio del mismo día,
  // que gane la nueva (se procesa después y pisa con > o igual fecha no,
  // así que el orden importa poco: desempata la fecha, no el origen).
  for (const res of legacyResults) {
    const exercises = res?.results?.exercises
    if (!Array.isArray(exercises)) continue
    for (const ex of exercises) {
      keepMostRecent(map, ex?.exercise_id, {
        oneRm: toNumber(ex?.best_one_rm ?? ex?.one_rm),
        date: res.eval_date || '',
        source: 'legacy',
      })
    }
  }

  for (const row of responses) {
    keepMostRecent(map, row?.plan_exercise?.exercise_id, {
      oneRm: toNumber(row?.student_response?.one_rm_estimated),
      date: row?.evaluation_result?.eval_date || '',
      source: 'exercise_eval',
    })
  }

  return map
}

/**
 * ¿El 1RM quedó viejo? (solo marca, no invalida)
 * @param {string} date - 'yyyy-MM-dd'
 * @param {string} today - 'yyyy-MM-dd'
 * @returns {boolean}
 */
export function isOneRmStale(date, today) {
  if (!date || !today) return false
  const d = new Date(`${date}T00:00:00`)
  const t = new Date(`${today}T00:00:00`)
  if (isNaN(d) || isNaN(t)) return false
  return (t - d) / 86400000 > ONE_RM_STALE_DAYS
}

/**
 * Resuelve el peso prescripto de un ejercicio para UNA persona.
 *
 * Cadena de resolución (decisión cerrada de diseño):
 *   1RM propio del ejercicio → 1RM del ejercicio de referencia → % pelado.
 * Sin estimación Epley en v1: si no hay evaluación, se degrada limpio
 * mostrando el porcentaje.
 *
 * @param {Object} args
 * @param {Object} args.planExercise - fila de plan_exercises (o su forma UI)
 * @param {Object} [args.block] - plan_block del ejercicio (para default_pct_1rm)
 * @param {Map} [args.oneRmMap] - salida de buildOneRmMap (null = sin datos)
 * @param {string} [args.weightMode] - modo efectivo ya resuelto; si no se pasa
 *        se usa planExercise.weight_mode
 * @param {string} [args.today] - 'yyyy-MM-dd' para marcar 1RM viejo
 * @returns {{
 *   status: 'not_pct'|'derived'|'missing_pct'|'missing_1rm',
 *   pct: number|null, kg: number|null, oneRm: number|null,
 *   oneRmDate: string|null, oneRmExerciseId: string|null,
 *   usedReference: boolean, stale: boolean
 * }}
 */
export function resolvePrescribedWeight({
  planExercise,
  block = null,
  oneRmMap = null,
  weightMode = null,
  today = null,
} = {}) {
  const base = {
    status: 'not_pct',
    pct: null,
    kg: null,
    oneRm: null,
    oneRmDate: null,
    oneRmExerciseId: null,
    usedReference: false,
    stale: false,
  }

  const mode = weightMode || planExercise?.weight_mode || null
  if (mode !== 'pct_1rm') return base

  const ownPct = planExercise?.pct_1rm
  const blockPct = block?.default_pct_1rm
  const pct =
    ownPct !== '' && ownPct != null
      ? toNumber(ownPct)
      : blockPct !== '' && blockPct != null
        ? toNumber(blockPct)
        : null

  if (pct == null || pct <= 0) return { ...base, status: 'missing_pct' }

  // Cadena: máximo propio → máximo del ejercicio de referencia.
  const ownId = planExercise?.exercise_id || null
  const refId = planExercise?.rm_reference_exercise_id || null
  const own = ownId && oneRmMap ? oneRmMap.get(ownId) : null
  const ref = !own && refId && oneRmMap ? oneRmMap.get(refId) : null
  const hit = own || ref

  if (!hit) return { ...base, status: 'missing_1rm', pct }

  return {
    status: 'derived',
    pct,
    kg: roundWeightKg((hit.oneRm * pct) / 100),
    oneRm: hit.oneRm,
    oneRmDate: hit.date || null,
    oneRmExerciseId: own ? ownId : refId,
    usedReference: !own,
    stale: isOneRmStale(hit.date, today),
  }
}

/**
 * Fecha de la evaluación en formato corto y localizado ("6 jul").
 * @param {string} date - 'yyyy-MM-dd'
 * @returns {string}
 */
export function formatOneRmDate(date) {
  if (!date) return ''
  try {
    return format(parseISO(date), i18n.t('dates.dayMonthShort'), { locale: dateLocale() })
  } catch {
    return date
  }
}

// ============================================================
// Fetchers (la parte que toca la red)
// ============================================================

/**
 * Trae el mapa de 1RM de UNA persona.
 * @param {Object} supabase
 * @param {string} studentId
 * @returns {Promise<Map>}
 */
export async function fetchOneRmMap(supabase, studentId) {
  if (!studentId) return new Map()
  const byStudent = await fetchOneRmMapsForStudents(supabase, [studentId])
  return byStudent.get(studentId) || new Map()
}

/**
 * Trae el mapa de 1RM de VARIAS personas de una (para el aviso al asignar).
 * @param {Object} supabase
 * @param {string[]} studentIds
 * @returns {Promise<Map<string, Map>>} student_id → mapa de 1RM
 */
export async function fetchOneRmMapsForStudents(supabase, studentIds = []) {
  const ids = [...new Set((studentIds || []).filter(Boolean))]
  const out = new Map()
  if (ids.length === 0) return out

  // Paso 1: las evaluaciones de esas personas. Trae de una el modelo viejo
  // (results.exercises[]) y las cabeceras que necesita el modelo nuevo.
  // Paginado: evaluation_results crece con cada evaluación cargada
  // (ver lib/fetchAllRows — PostgREST corta en 1000 filas EN SILENCIO).
  const results = await fetchAllRows((from, to) =>
    supabase
      .from('evaluation_results')
      .select('id, student_id, eval_date, results')
      .in('student_id', ids)
      .order('id')
      .range(from, to)
  )
  if (results.length === 0) {
    for (const id of ids) out.set(id, new Map())
    return out
  }

  // Paso 2: las respuestas por ejercicio de esas evaluaciones.
  // Se pide por evaluation_result_id (no filtrando la tabla embebida:
  // en PostgREST un filtro sobre un embed no descarta la fila padre,
  // solo anula el embed).
  const resultIds = results.map((r) => r.id)
  const responses = []
  for (let i = 0; i < resultIds.length; i += 200) {
    const chunk = resultIds.slice(i, i + 200)
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('evaluation_test_responses')
        .select(
          'evaluation_result_id, student_response, plan_exercise:plan_exercises!plan_exercise_id(exercise_id)'
        )
        .in('evaluation_result_id', chunk)
        .order('id')
        .range(from, to)
    )
    responses.push(...rows)
  }

  const resultById = new Map(results.map((r) => [r.id, r]))

  const responsesByStudent = new Map()
  for (const row of responses) {
    const parent = resultById.get(row.evaluation_result_id)
    if (!parent?.student_id) continue
    if (!responsesByStudent.has(parent.student_id)) responsesByStudent.set(parent.student_id, [])
    responsesByStudent.get(parent.student_id).push({
      ...row,
      evaluation_result: { eval_date: parent.eval_date },
    })
  }

  const legacyByStudent = new Map()
  for (const r of results) {
    if (!r.student_id) continue
    if (!legacyByStudent.has(r.student_id)) legacyByStudent.set(r.student_id, [])
    legacyByStudent.get(r.student_id).push(r)
  }

  for (const id of ids) {
    out.set(
      id,
      buildOneRmMap({
        responses: responsesByStudent.get(id) || [],
        legacyResults: legacyByStudent.get(id) || [],
      })
    )
  }
  return out
}
