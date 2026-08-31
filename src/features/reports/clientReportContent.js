// ============================================================
// Contenido del INFORME CLIENTE — módulo PURO (sin red/JSX/i18n).
// ------------------------------------------------------------
// Toma el retorno de buildReport (el MISMO motor del informe coach — acá no
// se calcula ninguna métrica nueva) y lo convierte en la estructura del
// informe carta para el alumno (docs/mockup-informe-alumno.html):
// bullets de "Lo mejor del período" + bienestar.
//
// Cada punto lleva CLAVE i18n + params, nunca texto armado: el texto vive en
// locales/{es,en}.json bajo report.client.* y se resuelve en la página con el
// idioma del ALUMNO (getFixedT). Los rótulos son neutros: un % negativo puede
// ser cambio de prescripción, jamás "retrocedió" (aprendizaje del PM rumano).
//
// "Sin cambios" (estancados) NO entra por defecto: decisión de Franco
// 2026-08-31 — la coach lo prende con un toggle si quiere (includeStalled).
//
// Cada punto puede referenciar un mini-gráfico (chart) que la página dibuja
// dentro de un <details> cerrado: la info escrita manda, el gráfico respalda.
// ============================================================

const MAX_RECORDS = 5
const MAX_PROGRESS = 3
const MIN_STREAK_TO_SHOW = 3

/**
 * @param {Object} report - retorno de buildReport (historia ya recortada).
 * @param {Object} [opts]
 * @param {boolean} [opts.includeStalled=false] - sumar puntos "se mantuvo en"
 *   (toggle de la coach; apagado por defecto).
 * @returns {{ points: Array, wellbeing: Array, wellbeingN: number }}
 *   points: [{ id, emoji, key, params, chart, optional }] en orden de lectura.
 *   key es relativa a report.client.points.* ; params son números CRUDOS
 *   (decisión 2026-08-31). chart: null | { type, exerciseId? }.
 */
export function buildClientContent(report, { includeStalled = false } = {}) {
  const points = []
  const m = report.modules

  // --- Asistencia (números crudos; con plan vigente, contra lo previsto) ---
  if (m.attendance) {
    const a = report.attendance
    const hasPlan = a.expectedDays > 0
    points.push({
      id: 'attendance',
      emoji: '🏆',
      key: hasPlan ? 'attendanceWithPlan' : 'attendance',
      params: {
        days: a.daysTrained,
        expected: a.expectedDays,
        perWeek: a.sessionsPerWeek,
      },
      chart: { type: 'attendance' },
      optional: false,
    })
    if (a.bestStreak >= MIN_STREAK_TO_SHOW) {
      points.push({
        id: 'streak',
        emoji: '🔥',
        key: 'streak',
        params: { streak: a.bestStreak },
        chart: null,
        optional: false,
      })
    }
  }

  // --- Récords: superó el mejor valor de TODA su historia previa ---
  const records = (report.highlights?.records ?? []).slice(0, MAX_RECORDS)
  for (const e of records) {
    points.push({
      id: `record-${e.exerciseId}`,
      emoji: '💪',
      key: 'record',
      params: { name: e.name, value: e.periodMax, prev: e.historyMax, metric: e.metric },
      chart: { type: 'exercise', exerciseId: e.exerciseId },
      optional: false,
    })
  }

  // --- Mayor cambio (neutro: "pasó de X a Y"). Un ejercicio que ya salió
  // como récord no se repite acá: mismo protagonista, un solo bullet. ---
  const recordIds = new Set(records.map((e) => e.exerciseId))
  const progress = (report.highlights?.topProgress ?? [])
    .filter((e) => !recordIds.has(e.exerciseId) && e.progression && e.progression.pct !== 0)
    .slice(0, MAX_PROGRESS)
  for (const e of progress) {
    points.push({
      id: `progress-${e.exerciseId}`,
      emoji: '📈',
      key: 'progress',
      params: {
        name: e.name,
        first: e.progression.firstAvg,
        last: e.progression.lastAvg,
        pct: e.progression.pct,
        metric: e.metric,
      },
      chart: { type: 'exercise', exerciseId: e.exerciseId },
      optional: false,
    })
  }

  // --- Volumen del trabajo principal (series, nunca tonelaje) ---
  if (m.mainWork && report.mainWork.prevSeriesTotal > 0) {
    points.push({
      id: 'volume',
      emoji: '📊',
      key: 'volume',
      params: {
        series: report.mainWork.seriesTotal,
        prevSeries: report.mainWork.prevSeriesTotal,
      },
      chart: { type: 'volume' },
      optional: false,
    })
  }

  // --- Bloques (aeróbico/circuito): "no hay logs" ≠ "no entrenó" ---
  for (const b of report.blocks ?? []) {
    if (b.blockType !== 'aerobic' && b.blockType !== 'circuit') continue
    points.push({
      id: `blocks-${b.blockType}`,
      emoji: b.blockType === 'aerobic' ? '🏃' : '🔄',
      key: b.blockType === 'aerobic' ? 'blocksAerobic' : 'blocksCircuit',
      params: { count: b.count, minutes: b.minutes },
      chart: null,
      optional: false,
    })
  }

  // --- Esfuerzo percibido (neutro, sin juicio) ---
  if (m.effort && report.effort.pseAvg != null) {
    points.push({
      id: 'effort',
      emoji: '💦',
      key: 'effort',
      params: { avg: report.effort.pseAvg },
      chart: { type: 'effort' },
      optional: false,
    })
  }

  // --- Sin cambios (SOLO con el toggle de la coach; neutro: "se mantuvo") ---
  if (includeStalled) {
    for (const e of report.highlights?.stalled ?? []) {
      points.push({
        id: `stalled-${e.exerciseId}`,
        emoji: '⚖️',
        key: 'stalled',
        params: { name: e.name, value: e.periodMax, metric: e.metric },
        chart: { type: 'exercise', exerciseId: e.exerciseId },
        optional: true,
      })
    }
  }

  return {
    points,
    // Bienestar: sección propia (pedido de Anto 2026-08-31), promedios del
    // período con "antes X" — passthrough del motor, la página traduce claves.
    wellbeing: m.wellbeing ? report.wellbeing : [],
    wellbeingN: m.wellbeing ? (report.wellbeing[0]?.n ?? 0) : 0,
  }
}
