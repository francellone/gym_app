// ============================================================
// Tests del contenido del informe cliente — TODO mockeado, cero filas en base.
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildReport } from './reportEngine'
import { buildClientContent } from './clientReportContent'

// --- fábrica de un report con la forma que devuelve buildReport ---------
function fakeReport(overrides = {}) {
  const base = {
    period: { from: '2026-08-01', to: '2026-08-28', days: 28 },
    previous: { from: '2026-07-04', to: '2026-07-31' },
    attendance: {
      daysTrained: 14,
      prevDaysTrained: 10,
      sessionsPerWeek: 3.5,
      fullDays: 12,
      partialDays: 2,
      bestStreak: 5,
      expectedDays: 16,
      compliancePct: 88,
      prevCompliancePct: 70,
      weekly: [],
    },
    activation: { series: 40, days: 12, pctOfTrainedDays: 86 },
    mainWork: { seriesTotal: 120, prevSeriesTotal: 100, byPattern: [] },
    exercises: [],
    highlights: { topProgress: [], records: [], stalled: [] },
    effort: { pseAvg: 7.2, prevPseAvg: 7.5, pseWeekly: [], borgAvg: null, borgWeekly: [] },
    blocks: [],
    wellbeing: [],
    modules: {
      attendance: true,
      activation: true,
      mainWork: true,
      exercises: false,
      effort: true,
      blocks: false,
      wellbeing: false,
    },
  }
  return { ...base, ...overrides }
}

const ex = (id, name, extra = {}) => ({
  exerciseId: id,
  name,
  metric: 'weight',
  points: [],
  logCount: 4,
  progression: { pct: 10, firstAvg: 30, lastAvg: 33, basis: 'weeks' },
  periodMax: 35,
  historyMax: 32,
  isRecord: false,
  stalled: false,
  ...extra,
})

describe('buildClientContent', () => {
  it('asistencia con plan vigente usa la clave attendanceWithPlan y números crudos', () => {
    const { points } = buildClientContent(fakeReport())
    const att = points.find((p) => p.id === 'attendance')
    expect(att.key).toBe('attendanceWithPlan')
    expect(att.params).toMatchObject({ days: 14, expected: 16 })
    expect(att.chart).toEqual({ type: 'attendance' })
  })

  it('sin plan vigente (expectedDays=0) cae a la clave attendance', () => {
    const r = fakeReport()
    r.attendance = { ...r.attendance, expectedDays: 0 }
    const { points } = buildClientContent(r)
    expect(points.find((p) => p.id === 'attendance').key).toBe('attendance')
  })

  it('la racha solo aparece desde 3 días', () => {
    const r = fakeReport()
    r.attendance = { ...r.attendance, bestStreak: 2 }
    expect(buildClientContent(r).points.find((p) => p.id === 'streak')).toBeUndefined()
    r.attendance.bestStreak = 3
    expect(buildClientContent(r).points.find((p) => p.id === 'streak')).toBeDefined()
  })

  it('récords llevan valor del período y el "antes", con su métrica', () => {
    const r = fakeReport()
    r.highlights.records = [
      ex('ex-1', 'Sentadilla', { isRecord: true, periodMax: 85, historyMax: 80 }),
    ]
    const rec = buildClientContent(r).points.find((p) => p.id === 'record-ex-1')
    expect(rec.key).toBe('record')
    expect(rec.params).toEqual({ name: 'Sentadilla', value: 85, prev: 80, metric: 'weight' })
    expect(rec.chart).toEqual({ type: 'exercise', exerciseId: 'ex-1' })
  })

  it('un ejercicio récord NO se repite en mayor cambio (un solo bullet por protagonista)', () => {
    const r = fakeReport()
    const sentadilla = ex('ex-1', 'Sentadilla', { isRecord: true })
    r.highlights.records = [sentadilla]
    r.highlights.topProgress = [sentadilla, ex('ex-2', 'Press banca')]
    const { points } = buildClientContent(r)
    expect(points.filter((p) => p.id.includes('ex-1'))).toHaveLength(1)
    expect(points.find((p) => p.id === 'progress-ex-2')).toBeDefined()
  })

  it('mayor cambio guarda pct crudo también negativo (el texto es neutro, nunca "retrocedió")', () => {
    const r = fakeReport()
    r.highlights.topProgress = [
      ex('ex-3', 'PM rumano', {
        progression: { pct: -66, firstAvg: 30, lastAvg: 10, basis: 'weeks' },
      }),
    ]
    const p = buildClientContent(r).points.find((x) => x.id === 'progress-ex-3')
    expect(p.params).toMatchObject({ pct: -66, first: 30, last: 10 })
  })

  it('mayor cambio con pct 0 no genera bullet', () => {
    const r = fakeReport()
    r.highlights.topProgress = [
      ex('ex-4', 'Remo', { progression: { pct: 0, firstAvg: 20, lastAvg: 20, basis: 'weeks' } }),
    ]
    expect(buildClientContent(r).points.find((x) => x.id === 'progress-ex-4')).toBeUndefined()
  })

  it('sin cambios está APAGADO por defecto y se prende con includeStalled', () => {
    const r = fakeReport()
    r.highlights.stalled = [ex('ex-5', 'Curl', { stalled: true, periodMax: 12 })]
    expect(buildClientContent(r).points.find((p) => p.id === 'stalled-ex-5')).toBeUndefined()
    const on = buildClientContent(r, { includeStalled: true })
    const st = on.points.find((p) => p.id === 'stalled-ex-5')
    expect(st).toBeDefined()
    expect(st.optional).toBe(true)
    expect(st.params).toMatchObject({ name: 'Curl', value: 12 })
  })

  it('volumen solo compara si hubo período anterior', () => {
    const r = fakeReport()
    expect(buildClientContent(r).points.find((p) => p.id === 'volume')).toBeDefined()
    r.mainWork = { ...r.mainWork, prevSeriesTotal: 0 }
    expect(buildClientContent(r).points.find((p) => p.id === 'volume')).toBeUndefined()
  })

  it('bloques aeróbico/circuito generan su bullet; "no hay logs" ≠ "no entrenó"', () => {
    const r = fakeReport()
    r.blocks = [
      { blockType: 'aerobic', count: 6, minutes: 150 },
      { blockType: 'circuit', count: 3, minutes: 45 },
      { blockType: 'unknown', count: 1, minutes: 0 },
    ]
    const { points } = buildClientContent(r)
    expect(points.find((p) => p.id === 'blocks-aerobic').params).toEqual({ count: 6, minutes: 150 })
    expect(points.find((p) => p.id === 'blocks-circuit')).toBeDefined()
    expect(points.find((p) => p.id === 'blocks-unknown')).toBeUndefined()
  })

  it('módulo apagado = punto ausente (sin datos no se promete nada)', () => {
    const r = fakeReport()
    r.modules = { ...r.modules, attendance: false, effort: false, mainWork: false }
    const { points } = buildClientContent(r)
    expect(points.find((p) => p.id === 'attendance')).toBeUndefined()
    expect(points.find((p) => p.id === 'effort')).toBeUndefined()
    expect(points.find((p) => p.id === 'volume')).toBeUndefined()
  })

  it('bienestar es sección propia con passthrough del motor', () => {
    const r = fakeReport()
    r.wellbeing = [{ key: 'sleep_quality', avg: 3.8, prevAvg: 3.2, n: 9 }]
    r.modules = { ...r.modules, wellbeing: true }
    const c = buildClientContent(r)
    expect(c.wellbeing).toHaveLength(1)
    expect(c.wellbeingN).toBe(9)
  })

  // --- compatibilidad de forma con el motor REAL (no solo con el fake) ---
  it('acepta el retorno real de buildReport sin romper', () => {
    const mk = (date, exercise, weights) => ({
      id: `l-${date}-${exercise.id}`,
      logged_date: date,
      actual_reps_jsonb: [8, 8, 8],
      actual_weights_jsonb: weights,
      source: 'student',
      plan: { plan_type: 'training' },
      plan_exercise: { section: 'day_a', exercise },
    })
    const SQ = { id: 'ex-sq', name: 'Sentadilla' }
    const report = buildReport({
      from: '2026-08-01',
      to: '2026-08-28',
      logs: [
        mk('2026-07-10', SQ, [60, 60, 60]),
        mk('2026-08-03', SQ, [70, 70, 70]),
        mk('2026-08-24', SQ, [80, 80, 80]),
      ],
      blockLogs: [],
      sessions: [],
      wellbeing: [],
      assignments: [],
      tagsByExercise: new Map([['ex-sq', ['SQUAT']]]),
    })
    const c = buildClientContent(report, { includeStalled: true })
    expect(Array.isArray(c.points)).toBe(true)
    expect(c.points.find((p) => p.id === 'record-ex-sq')).toBeDefined()
  })
})
