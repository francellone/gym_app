// ============================================================
// Motor de métricas del informe de progreso
// ------------------------------------------------------------
// Funciones PURAS: filas adentro, informe estructurado afuera. Nada de red,
// nada de i18n, nada de JSX — el texto y los gráficos se cuelgan de esto.
//
// Decisiones que este módulo ENCARNA (no re-discutir acá; ver memoria del
// proyecto: informe-motor-metricas-radiografia / informe-progreso-alumno-sin-ia):
//   1. El trabajo se separa primero por SECCIÓN del plan: `activation` vs
//      días (day_*). El 55% de las series históricas son activación; mezclarlas
//      convierte el gráfico de volumen en un gráfico de calentamiento.
//   2. Volumen del período = SERIES por patrón de movimiento (exercise_tags),
//      solo sobre el trabajo principal. El tag ACTIVACION se ignora acá porque
//      la activación ya se contó por sección. Una serie multi-tag cuenta ENTERA
//      en cada patrón (solapamiento real ~1%): barras que se comparan, no
//      torta que suma 100.
//   3. Los kilos NUNCA se suman entre ejercicios (el tonelaje mide palanca,
//      no esfuerzo): van por ejercicio — progresión, récords, estancamientos.
//   4. Progresión = computeProgression, la definición única de la app.
//   5. Ejercicio sin ningún peso > 0 en el período → su métrica son las reps
//      (repsMaxOfLog). Con CUALQUIER peso, gana el peso. NUNCA se reconstruye
//      carga con profiles.weight_kg.
//   6. Los logs con source='coach' son datos del alumno: acá no se mira
//      `source` a propósito.
//   7. Las evaluaciones no son entrenamiento: filterTrainingLogs.
//   8. "No hay workout_logs" ≠ "no entrenó": los días de solo bloque
//      (workout_block_logs: aeróbico/circuito) cuentan para asistencia.
//   9. Un módulo existe solo si tiene datos en el período (flags en
//      `modules`) — el informe es modular, sin gráficos vacíos.
// ============================================================
import { parseISO, differenceInCalendarDays, addDays, startOfWeek, format } from 'date-fns'
import { readLogReps, maxWeightOfLog } from '@/features/plans/helpers'
import { computeProgression, repsMaxOfLog } from '@/features/progress/progression'
import { filterTrainingLogs } from '@/features/plans/typeFilters'

// Un ejercicio se considera estancado si su progresión por semanas quedó
// dentro de ±STALL_THRESHOLD_PCT con al menos MIN_POINTS_FOR_STALL registros.
export const STALL_THRESHOLD_PCT = 3
export const MIN_POINTS_FOR_STALL = 4
// Tag que se ignora en el gráfico de patrones (ya contado por sección).
export const ACTIVATION_TAG = 'ACTIVACION'
export const ACTIVATION_SECTION = 'activation'
// Bucket para series de ejercicios sin ningún tag (0.8% medido).
export const UNTAGGED_KEY = '__untagged__'

/**
 * Cantidad de series de un log: largo del array de reps (jsonb o legacy),
 * si no actual_sets, si no 1. Una serie en "pasos"/"segundos" sigue siendo
 * una serie (las unidades raras solo quedan fuera de sumas de REPS).
 */
export function seriesCountOfLog(log) {
  const reps = readLogReps(log)
  if (reps.length > 0) return reps.length
  const sets = parseInt(log?.actual_sets)
  return !isNaN(sets) && sets > 0 ? sets : 1
}

/**
 * Período anterior de la misma duración, pegado al actual.
 * from/to inclusive, 'yyyy-MM-dd'.
 */
export function previousPeriod(from, to) {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const prevTo = new Date(parseISO(from).getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000)
  return { from: format(prevFrom, 'yyyy-MM-dd'), to: format(prevTo, 'yyyy-MM-dd') }
}

const inRange = (d, from, to) => d && d >= from && d <= to

/** Filtra filas por rango de fecha (inclusive) sobre `dateKey`. */
export function sliceByPeriod(rows, from, to, dateKey = 'logged_date') {
  return (rows || []).filter((r) => inRange(r?.[dateKey], from, to))
}

const isActivationLog = (log) => log?.plan_exercise?.section === ACTIVATION_SECTION

const weekKey = (dateStr) =>
  format(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd')

const round1 = (n) => Math.round(n * 10) / 10

function avgOrNull(nums) {
  const v = nums.filter((n) => typeof n === 'number' && !isNaN(n))
  return v.length > 0 ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/** Promedio semanal de una lista de {date, value} → [{week, avg, n}] */
function weeklyAverages(points) {
  const byWeek = new Map()
  for (const p of points) {
    if (p.value == null || isNaN(p.value)) continue
    const k = weekKey(p.date)
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k).push(p.value)
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, vals]) => ({
      week,
      avg: round1(vals.reduce((a, b) => a + b, 0) / vals.length),
      n: vals.length,
    }))
}

// ============================================================
// Días previstos por el plan vigente
// ------------------------------------------------------------
// Pedido de Franco (2026-08-29): "2.5 días/semana" no dice nada sin saber
// cuántos pedía el plan, y el plan cambia (2 días, después 3). Regla:
//   - por cada DÍA del rango, el previsto es sessions_per_week/7 del plan
//     de ENTRENAMIENTO vigente ese día (start_date <= día <= end_date;
//     end_date null = sigue vigente);
//   - si dos asignaciones se pisan (semana de transición), gana la de
//     start_date más nuevo;
//   - sin plan vigente ese día → 0 previsto: los días anteriores a arrancar
//     o los huecos entre planes NO cuentan como incumplimiento;
//   - evaluaciones y asignaciones `archived` no suman (archived puede tener
//     end_date null y reclamaría previstos hasta hoy).
// ============================================================

/**
 * Días de entrenamiento previstos por el plan vigente en un rango.
 * @param {Array<{start_date, end_date, sessions_per_week, plan_type, status}>} assignments
 * @param {string} from - 'yyyy-MM-dd' inclusive
 * @param {string} to - 'yyyy-MM-dd' inclusive
 * @returns {{total:number, byWeek:Map<string,number>}} total con decimales
 *   (redondear al mostrar); byWeek con la misma clave de semana del resto
 *   del informe (lunes).
 */
export function expectedTrainingDays(assignments, from, to) {
  const usable = (assignments || []).filter(
    (a) =>
      a?.start_date &&
      (a.plan_type == null || a.plan_type === 'training') &&
      a.status !== 'archived' &&
      Number(a.sessions_per_week) > 0
  )
  const byWeek = new Map()
  let total = 0
  if (usable.length === 0) return { total: 0, byWeek }

  const end = parseISO(to)
  for (let d = parseISO(from); d <= end; d = addDays(d, 1)) {
    const ds = format(d, 'yyyy-MM-dd')
    let best = null
    for (const a of usable) {
      if (a.start_date <= ds && (!a.end_date || ds <= a.end_date)) {
        if (!best || a.start_date > best.start_date) best = a
      }
    }
    if (!best) continue
    const daily = Number(best.sessions_per_week) / 7
    total += daily
    const wk = weekKey(ds)
    byWeek.set(wk, (byWeek.get(wk) || 0) + daily)
  }
  return { total, byWeek }
}

/**
 * Series por patrón de movimiento sobre logs de trabajo principal.
 * @param {Array} mainLogs - logs NO-activación del período
 * @param {Map<string,string[]>} tagsByExercise - exercise_id → nombres de tag
 * @returns {Array<{pattern:string, series:number}>} orden desc por series;
 *   los sin tag van al bucket UNTAGGED_KEY.
 */
export function seriesByPattern(mainLogs, tagsByExercise) {
  const acc = new Map()
  for (const log of mainLogs) {
    const exId = log?.plan_exercise?.exercise?.id
    const series = seriesCountOfLog(log)
    const tags = (exId && tagsByExercise?.get(exId)) || []
    const patterns = tags.filter((t) => t !== ACTIVATION_TAG)
    if (patterns.length === 0) {
      acc.set(UNTAGGED_KEY, (acc.get(UNTAGGED_KEY) || 0) + series)
      continue
    }
    for (const p of patterns) acc.set(p, (acc.get(p) || 0) + series)
  }
  return [...acc.entries()]
    .map(([pattern, series]) => ({ pattern, series }))
    .sort((a, b) => b.series - a.series)
}

/**
 * Puntos {date, value} de un ejercicio, deduplicados por fecha (máximo del
 * día). El mismo ejercicio dos veces el mismo día es UNA columna, no dos
 * (defecto conocido de la pestaña Progreso que acá no se replica).
 */
function dailyMaxPoints(logs, valueOfLog) {
  const byDate = new Map()
  for (const log of logs) {
    const v = valueOfLog(log)
    if (!v || v <= 0) continue
    const d = log.logged_date
    if (!byDate.has(d) || v > byDate.get(d)) byDate.set(d, v)
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, value]) => ({ date, value }))
}

/**
 * Módulo por-ejercicio del trabajo principal: métrica (peso o reps),
 * progresión, máximo del período, récord vs historia previa, estancamiento.
 *
 * @param {Array} mainLogs - logs no-activación del período
 * @param {Array} historyLogs - TODOS los logs de entrenamiento ANTERIORES al
 *   período (para récords); pueden incluir activación, se filtra igual por
 *   ejercicio.
 */
export function perExerciseMetrics(mainLogs, historyLogs) {
  const byEx = new Map()
  for (const log of mainLogs) {
    const ex = log?.plan_exercise?.exercise
    if (!ex?.id) continue
    if (!byEx.has(ex.id)) byEx.set(ex.id, { id: ex.id, name: ex.name, logs: [] })
    byEx.get(ex.id).logs.push(log)
  }
  const histByEx = new Map()
  for (const log of historyLogs || []) {
    const exId = log?.plan_exercise?.exercise?.id
    if (!exId) continue
    if (!histByEx.has(exId)) histByEx.set(exId, [])
    histByEx.get(exId).push(log)
  }

  const out = []
  for (const { id, name, logs } of byEx.values()) {
    const hasWeight = logs.some((l) => maxWeightOfLog(l) > 0)
    const valueOf = hasWeight ? maxWeightOfLog : repsMaxOfLog
    const points = dailyMaxPoints(logs, valueOf)
    const progression = computeProgression(points)
    const periodMax = points.length > 0 ? Math.max(...points.map((p) => p.value)) : 0

    // Récord: superó el mejor valor de TODA su historia previa en la misma
    // métrica. Sin historia previa no hay récord (sería "récord" de estreno).
    const hist = histByEx.get(id) || []
    const histValues = hist.map((l) => valueOf(l)).filter((v) => v > 0)
    const historyMax = histValues.length > 0 ? Math.max(...histValues) : null
    const isRecord = historyMax != null && periodMax > historyMax

    const stalled =
      progression != null &&
      progression.basis === 'weeks' &&
      Math.abs(progression.pct) <= STALL_THRESHOLD_PCT &&
      points.length >= MIN_POINTS_FOR_STALL

    out.push({
      exerciseId: id,
      name,
      metric: hasWeight ? 'weight' : 'reps',
      points,
      logCount: logs.length,
      progression,
      periodMax,
      historyMax,
      isRecord,
      stalled,
    })
  }
  // Más datos primero: es el orden útil para el informe.
  return out.sort((a, b) => b.points.length - a.points.length)
}

/**
 * Arma el informe completo de UNA persona para un período.
 *
 * @param {Object} input
 * @param {string} input.from - 'yyyy-MM-dd' inclusive
 * @param {string} input.to - 'yyyy-MM-dd' inclusive
 * @param {Array} input.logs - TODOS los workout_logs del alumno (historia
 *   completa), con joins plan(plan_type) y plan_exercise(section,
 *   exercise(id,name)). El motor recorta período/previo/historia.
 * @param {Array} [input.blockLogs] - TODOS los workout_block_logs, con
 *   plan(plan_type) y plan_block(block_type, title).
 * @param {Array} [input.sessions] - filas de v_workout_session_intensity.
 * @param {Array} [input.wellbeing] - wellbeing_logs (dateKey `date`).
 * @param {Map<string,string[]>} [input.tagsByExercise]
 * @returns {Object} informe estructurado (ver README de la feature).
 */
export function buildReport({
  from,
  to,
  logs = [],
  blockLogs = [],
  sessions = [],
  wellbeing = [],
  assignments = [],
  tagsByExercise = new Map(),
} = {}) {
  const prev = previousPeriod(from, to)

  const trainingLogs = filterTrainingLogs(logs)
  const trainingBlockLogs = filterTrainingLogs(blockLogs)

  const periodLogs = sliceByPeriod(trainingLogs, from, to)
  const prevLogs = sliceByPeriod(trainingLogs, prev.from, prev.to)
  const historyLogs = trainingLogs.filter((l) => l.logged_date < from)

  const periodBlockLogs = sliceByPeriod(trainingBlockLogs, from, to)
  const prevBlockLogs = sliceByPeriod(trainingBlockLogs, prev.from, prev.to)

  // --- Asistencia: días distintos con CUALQUIER registro (logs o bloques) ---
  const daysOf = (ls, bs) => {
    const s = new Set()
    for (const l of ls) if (l.logged_date) s.add(l.logged_date)
    for (const b of bs) if (b.logged_date) s.add(b.logged_date)
    return s
  }
  const periodDays = daysOf(periodLogs, periodBlockLogs)
  const prevDays = daysOf(prevLogs, prevBlockLogs)
  const totalDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const weeksInPeriod = totalDays / 7

  const daysByWeek = new Map()
  for (const d of periodDays) {
    const k = weekKey(d)
    daysByWeek.set(k, (daysByWeek.get(k) || 0) + 1)
  }

  // --- Completos vs solo activación (caso Andrea) ---
  // Un día es COMPLETO si tiene trabajo principal: algún log fuera de la
  // sección activación, o un bloque (aeróbico/circuito). Si todo lo que hay
  // ese día es activación, es un día PARCIAL: cuenta como asistencia pero el
  // informe lo distingue — que exista actividad no significa que se hizo la
  // sesión (memoria: andrea-solo-activacion-verde).
  const mainWorkDays = new Set()
  for (const l of periodLogs)
    if (!isActivationLog(l) && l.logged_date) mainWorkDays.add(l.logged_date)
  for (const b of periodBlockLogs) if (b.logged_date) mainWorkDays.add(b.logged_date)
  const fullDays = [...periodDays].filter((d) => mainWorkDays.has(d)).length
  const partialDays = periodDays.size - fullDays
  const fullByWeek = new Map()
  for (const d of periodDays) {
    if (!mainWorkDays.has(d)) continue
    const k = weekKey(d)
    fullByWeek.set(k, (fullByWeek.get(k) || 0) + 1)
  }

  // Mejor racha: días CALENDARIO consecutivos con actividad en el período.
  const sortedDays = [...periodDays].sort()
  let bestStreak = 0
  let run = 0
  for (let i = 0; i < sortedDays.length; i++) {
    if (
      i > 0 &&
      differenceInCalendarDays(parseISO(sortedDays[i]), parseISO(sortedDays[i - 1])) === 1
    ) {
      run += 1
    } else {
      run = 1
    }
    if (run > bestStreak) bestStreak = run
  }
  // Previstos por el plan vigente (ver expectedTrainingDays).
  const expected = expectedTrainingDays(assignments, from, to)
  const prevExpected = expectedTrainingDays(assignments, prev.from, prev.to)
  const expectedDays = Math.round(expected.total)
  const compliancePct =
    expected.total > 0 ? Math.round((100 * periodDays.size) / expected.total) : null
  const prevCompliancePct =
    prevExpected.total > 0 ? Math.round((100 * prevDays.size) / prevExpected.total) : null

  // Semanas con actividad O con previsto (una semana prevista sin entrenar
  // tiene que aparecer en 0, no desaparecer del gráfico).
  const allWeeks = new Set([...daysByWeek.keys(), ...expected.byWeek.keys()])
  const attendanceWeekly = [...allWeeks]
    .sort((a, b) => (a < b ? -1 : 1))
    .map((week) => {
      const days = daysByWeek.get(week) || 0
      const full = fullByWeek.get(week) || 0
      return {
        week,
        days,
        fullDays: full,
        partialDays: days - full,
        expected: round1(expected.byWeek.get(week) || 0),
      }
    })

  // --- Activación vs trabajo principal (por sección del plan) ---
  const activationLogs = periodLogs.filter(isActivationLog)
  const mainLogs = periodLogs.filter((l) => !isActivationLog(l))
  const prevMainLogs = prevLogs.filter((l) => !isActivationLog(l))

  const activationDays = new Set(activationLogs.map((l) => l.logged_date))
  const activationSeries = activationLogs.reduce((a, l) => a + seriesCountOfLog(l), 0)

  // --- Series por patrón (solo trabajo principal) + comparación ---
  const patterns = seriesByPattern(mainLogs, tagsByExercise)
  const prevPatterns = seriesByPattern(prevMainLogs, tagsByExercise)
  const prevByPattern = new Map(prevPatterns.map((p) => [p.pattern, p.series]))
  const patternsWithPrev = patterns.map((p) => ({
    ...p,
    prevSeries: prevByPattern.get(p.pattern) ?? null,
  }))
  const mainSeriesTotal = mainLogs.reduce((a, l) => a + seriesCountOfLog(l), 0)
  const prevMainSeriesTotal = prevMainLogs.reduce((a, l) => a + seriesCountOfLog(l), 0)

  // --- Por ejercicio (kilos/reps donde corresponde) ---
  const exercises = perExerciseMetrics(mainLogs, historyLogs)
  const withProgression = exercises.filter((e) => e.progression != null)
  const topProgress = [...withProgression].sort((a, b) => b.progression.pct - a.progression.pct)
  const records = exercises.filter((e) => e.isRecord)
  const stalled = exercises.filter((e) => e.stalled)

  // --- Esfuerzo: PSE por semana (logs) + Borg por semana (sesiones) ---
  const psePoints = periodLogs
    .filter((l) => l.perceived_difficulty != null)
    .map((l) => ({ date: l.logged_date, value: Number(l.perceived_difficulty) }))
  const periodSessions = sliceByPeriod(sessions, from, to)
  const borgPoints = periodSessions
    .filter((s) => s.borg_value != null)
    .map((s) => ({ date: s.logged_date, value: Number(s.borg_value) }))
  const effort = {
    pseAvg: avgOrNull(psePoints.map((p) => p.value)),
    prevPseAvg: avgOrNull(
      sliceByPeriod(trainingLogs, prev.from, prev.to)
        .filter((l) => l.perceived_difficulty != null)
        .map((l) => Number(l.perceived_difficulty))
    ),
    pseWeekly: weeklyAverages(psePoints),
    borgAvg: avgOrNull(borgPoints.map((p) => p.value)),
    borgWeekly: weeklyAverages(borgPoints),
  }

  // --- Bloques (aeróbico/circuito) ---
  const blocksByType = new Map()
  for (const b of periodBlockLogs) {
    const type = b?.plan_block?.block_type || 'unknown'
    if (!blocksByType.has(type)) blocksByType.set(type, { count: 0, minutes: 0 })
    const acc = blocksByType.get(type)
    acc.count += 1
    if (b.actual_minutes != null && !isNaN(Number(b.actual_minutes)))
      acc.minutes += Number(b.actual_minutes)
  }
  const blocks = [...blocksByType.entries()].map(([blockType, v]) => ({
    blockType,
    count: v.count,
    minutes: round1(v.minutes),
  }))

  // --- Wellbeing (promedios del período vs previo, por métrica) ---
  const WELLBEING_KEYS = [
    'sleep_quality',
    'nutrition_quality',
    'hydration_quality',
    'energy_level',
    'stress_level',
    'muscle_fatigue',
  ]
  const periodWb = sliceByPeriod(wellbeing, from, to, 'date')
  const prevWb = sliceByPeriod(wellbeing, prev.from, prev.to, 'date')
  const wellbeingModule = WELLBEING_KEYS.map((key) => ({
    key,
    avg: avgOrNull(
      periodWb
        .map((w) => w[key])
        .filter((v) => v != null)
        .map(Number)
    ),
    prevAvg: avgOrNull(
      prevWb
        .map((w) => w[key])
        .filter((v) => v != null)
        .map(Number)
    ),
    n: periodWb.filter((w) => w[key] != null).length,
  })).filter((m) => m.avg != null)

  return {
    period: { from, to, days: totalDays },
    previous: prev,
    attendance: {
      daysTrained: periodDays.size,
      prevDaysTrained: prevDays.size,
      sessionsPerWeek: round1(periodDays.size / weeksInPeriod),
      fullDays,
      partialDays,
      bestStreak,
      expectedDays,
      compliancePct,
      prevCompliancePct,
      weekly: attendanceWeekly,
    },
    activation: {
      series: activationSeries,
      days: activationDays.size,
      // De los días que entrenó, ¿en cuántos hizo la activación?
      pctOfTrainedDays:
        periodDays.size > 0 ? Math.round((100 * activationDays.size) / periodDays.size) : 0,
    },
    mainWork: {
      seriesTotal: mainSeriesTotal,
      prevSeriesTotal: prevMainSeriesTotal,
      byPattern: patternsWithPrev,
    },
    exercises,
    highlights: {
      topProgress: topProgress.slice(0, 5),
      records,
      stalled,
    },
    effort,
    blocks,
    wellbeing: wellbeingModule,
    modules: {
      attendance: periodDays.size > 0,
      activation: activationSeries > 0,
      mainWork: mainSeriesTotal > 0,
      exercises: exercises.length > 0,
      effort: effort.pseAvg != null || effort.borgAvg != null,
      blocks: blocks.length > 0,
      wellbeing: wellbeingModule.length > 0,
    },
  }
}
