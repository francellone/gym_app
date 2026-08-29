// ============================================================
// Tests del motor del informe — TODO mockeado, cero filas en la base.
// Cada trampa de datos conocida tiene su test con el nombre de la trampa.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  buildReport,
  previousPeriod,
  seriesCountOfLog,
  seriesByPattern,
  perExerciseMetrics,
  UNTAGGED_KEY,
} from './reportEngine'

// --- fábricas de filas mock -------------------------------------------
let idSeq = 0
function log({
  date,
  exercise = { id: 'ex-1', name: 'Sentadilla' },
  section = 'day_a',
  reps = [10, 10, 10],
  weights = null,
  planType = 'training',
  pse = null,
  source = 'student',
} = {}) {
  return {
    id: `log-${++idSeq}`,
    logged_date: date,
    actual_reps_jsonb: reps,
    actual_weights_jsonb: weights,
    perceived_difficulty: pse,
    source,
    plan: { plan_type: planType },
    plan_exercise: { section, exercise },
  }
}
const EX_PRESS = { id: 'ex-press', name: 'Press banca' }
const EX_PLANCHA = { id: 'ex-plancha', name: 'Plancha' }
const EX_GATO = { id: 'ex-gato', name: 'Gato-camello' }

const TAGS = new Map([
  ['ex-press', ['PUSH EXERCISE']],
  ['ex-plancha', ['CORE']],
  ['ex-gato', ['ACTIVACION']],
  ['ex-multi', ['PUSH EXERCISE', 'CORE']],
])

const PERIOD = { from: '2026-08-01', to: '2026-08-28' }

// ----------------------------------------------------------------------
describe('previousPeriod', () => {
  it('devuelve un período pegado, de la misma duración', () => {
    expect(previousPeriod('2026-08-01', '2026-08-28')).toEqual({
      from: '2026-07-04',
      to: '2026-07-31',
    })
  })
})

describe('seriesCountOfLog', () => {
  it('usa el largo del array de reps', () => {
    expect(seriesCountOfLog({ actual_reps_jsonb: [10, 8, 6] })).toBe(3)
  })
  it('cae a actual_sets y después a 1', () => {
    expect(seriesCountOfLog({ actual_reps_jsonb: [], actual_sets: 4 })).toBe(4)
    expect(seriesCountOfLog({})).toBe(1)
  })
})

// ----------------------------------------------------------------------
describe('trampa: activación separada del trabajo principal por SECCIÓN', () => {
  it('las series de la sección activation no entran al gráfico de patrones', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [
        log({ date: '2026-08-03', exercise: EX_GATO, section: 'activation', reps: [10, 10] }),
        log({ date: '2026-08-03', exercise: EX_PRESS, section: 'day_a', reps: [8, 8, 8] }),
      ],
      tagsByExercise: TAGS,
    })
    expect(r.activation.series).toBe(2)
    expect(r.mainWork.seriesTotal).toBe(3)
    expect(r.mainWork.byPattern).toEqual([
      { pattern: 'PUSH EXERCISE', series: 3, prevSeries: null },
    ])
  })

  it('caso Andrea: solo activación → mainWork vacío pero activación y asistencia cuentan', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [
        log({ date: '2026-08-03', exercise: EX_GATO, section: 'activation' }),
        log({ date: '2026-08-05', exercise: EX_GATO, section: 'activation' }),
      ],
      tagsByExercise: TAGS,
    })
    expect(r.modules.mainWork).toBe(false)
    expect(r.modules.activation).toBe(true)
    expect(r.attendance.daysTrained).toBe(2)
    expect(r.activation.pctOfTrainedDays).toBe(100)
  })
})

describe('trampa: el tag ACTIVACION se ignora en patrones (ya contado por sección)', () => {
  it('un ejercicio con tag ACTIVACION usado en day_a cae al bucket sin-tag, no a un patrón fantasma', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [log({ date: '2026-08-03', exercise: EX_GATO, section: 'day_a', reps: [12] })],
      tagsByExercise: TAGS,
    })
    expect(r.mainWork.byPattern).toEqual([{ pattern: UNTAGGED_KEY, series: 1, prevSeries: null }])
  })
})

describe('multi-tag: la serie cuenta ENTERA en cada patrón', () => {
  it('PUSH+CORE con 3 series suma 3 a cada barra', () => {
    const rows = seriesByPattern(
      [log({ date: '2026-08-03', exercise: { id: 'ex-multi', name: 'Pallof press' } })],
      TAGS
    )
    expect(rows).toEqual([
      { pattern: 'PUSH EXERCISE', series: 3 },
      { pattern: 'CORE', series: 3 },
    ])
  })
})

// ----------------------------------------------------------------------
describe('trampa: evaluaciones excluidas', () => {
  it('logs de plan evaluation no cuentan en nada', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [log({ date: '2026-08-03', exercise: EX_PRESS, planType: 'evaluation' })],
      tagsByExercise: TAGS,
    })
    expect(r.attendance.daysTrained).toBe(0)
    expect(r.mainWork.seriesTotal).toBe(0)
    expect(r.modules.mainWork).toBe(false)
  })
})

describe('trampa: source=coach ES dato del alumno', () => {
  it('un log cargado por la coach cuenta igual que uno propio', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [
        log({ date: '2026-08-03', exercise: EX_PRESS, source: 'coach' }),
        log({ date: '2026-08-05', exercise: EX_PRESS, source: 'student' }),
      ],
      tagsByExercise: TAGS,
    })
    expect(r.attendance.daysTrained).toBe(2)
    expect(r.mainWork.seriesTotal).toBe(6)
  })
})

describe('trampa: días de solo bloque (aeróbico/circuito) no son ausencia', () => {
  it('un workout_block_log suma al heatmap/asistencia y al módulo de bloques', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [],
      blockLogs: [
        {
          logged_date: '2026-08-04',
          actual_minutes: 25,
          plan: { plan_type: 'training' },
          plan_block: { block_type: 'aerobic', title: 'Cinta' },
        },
      ],
    })
    expect(r.attendance.daysTrained).toBe(1)
    expect(r.blocks).toEqual([{ blockType: 'aerobic', count: 1, minutes: 25 }])
    expect(r.modules.blocks).toBe(true)
  })
})

// ----------------------------------------------------------------------
describe('métrica por ejercicio: BW → reps, cualquier peso → peso', () => {
  it('sin ningún peso en el período la métrica son reps', () => {
    const [ex] = perExerciseMetrics(
      [
        log({ date: '2026-08-03', exercise: EX_PLANCHA, reps: [20, 20] }),
        log({ date: '2026-08-24', exercise: EX_PLANCHA, reps: [30, 28] }),
      ],
      []
    )
    expect(ex.metric).toBe('reps')
    expect(ex.periodMax).toBe(30)
    expect(ex.progression.pct).toBe(50) // 20 → 30, puntos (rango < 14 días... no: 21 días → weeks)
  })

  it('con CUALQUIER peso > 0 gana el peso', () => {
    const [ex] = perExerciseMetrics(
      [
        log({ date: '2026-08-03', exercise: EX_PRESS, reps: [10, 10], weights: [0, 0] }),
        log({ date: '2026-08-20', exercise: EX_PRESS, reps: [10, 10], weights: [30, 32.5] }),
      ],
      []
    )
    expect(ex.metric).toBe('weight')
    expect(ex.periodMax).toBe(32.5)
  })

  it('dos logs del mismo ejercicio el mismo día = UN punto (máximo del día)', () => {
    const [ex] = perExerciseMetrics(
      [
        log({ date: '2026-08-03', exercise: EX_PRESS, weights: [30] }),
        log({ date: '2026-08-03', exercise: EX_PRESS, weights: [35] }),
      ],
      []
    )
    expect(ex.points).toEqual([{ date: '2026-08-03', value: 35 }])
  })
})

describe('récords: contra TODA la historia previa, y sin historia no hay récord', () => {
  const periodLogs = [log({ date: '2026-08-10', exercise: EX_PRESS, weights: [40] })]
  it('supera el máximo histórico → récord', () => {
    const [ex] = perExerciseMetrics(periodLogs, [
      log({ date: '2026-05-10', exercise: EX_PRESS, weights: [37.5] }),
    ])
    expect(ex.isRecord).toBe(true)
    expect(ex.historyMax).toBe(37.5)
  })
  it('primer período del ejercicio → nunca es récord', () => {
    const [ex] = perExerciseMetrics(periodLogs, [])
    expect(ex.isRecord).toBe(false)
    expect(ex.historyMax).toBe(null)
  })
})

// ----------------------------------------------------------------------
describe('esfuerzo y wellbeing', () => {
  it('PSE promedio del período y del previo', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [
        log({ date: '2026-08-03', exercise: EX_PRESS, pse: 7 }),
        log({ date: '2026-08-10', exercise: EX_PRESS, pse: 8 }),
        log({ date: '2026-07-10', exercise: EX_PRESS, pse: 5 }), // período previo
      ],
      tagsByExercise: TAGS,
    })
    expect(r.effort.pseAvg).toBe(7.5)
    expect(r.effort.prevPseAvg).toBe(5)
    expect(r.modules.effort).toBe(true)
  })

  it('wellbeing: promedia solo métricas con datos y usa dateKey `date`', () => {
    const r = buildReport({
      ...PERIOD,
      logs: [],
      wellbeing: [
        { date: '2026-08-05', sleep_quality: 4, energy_level: 3 },
        { date: '2026-08-12', sleep_quality: 2, energy_level: null },
      ],
    })
    const sleep = r.wellbeing.find((m) => m.key === 'sleep_quality')
    expect(sleep.avg).toBe(3)
    expect(sleep.n).toBe(2)
    expect(r.wellbeing.find((m) => m.key === 'stress_level')).toBeUndefined()
    expect(r.modules.wellbeing).toBe(true)
  })
})

// ----------------------------------------------------------------------
describe('informe vacío: módulos apagados, sin NaN', () => {
  it('sin datos, todos los flags en false y números en 0/null', () => {
    const r = buildReport({ ...PERIOD, logs: [] })
    expect(Object.values(r.modules).every((v) => v === false)).toBe(true)
    expect(r.attendance.daysTrained).toBe(0)
    expect(r.activation.pctOfTrainedDays).toBe(0)
    expect(r.effort.pseAvg).toBe(null)
    expect(JSON.stringify(r)).not.toContain('NaN')
  })
})

// ----------------------------------------------------------------------
describe('cumplimiento vs plan vigente (expectedTrainingDays)', () => {
  // Período de referencia: 4 semanas exactas, lunes a domingo
  const FROM = '2026-08-03' // lunes
  const TO = '2026-08-30' // domingo
  const asg = (over = {}) => ({
    start_date: '2026-01-01',
    end_date: null,
    status: 'active',
    plan_type: 'training',
    sessions_per_week: 2,
    ...over,
  })

  it('plan que cambia de 2 a 3 días a mitad del período: 2+2+3+3 = 10 previstos', async () => {
    const { expectedTrainingDays } = await import('./reportEngine')
    const { total, byWeek } = expectedTrainingDays(
      [
        asg({ start_date: '2026-01-01', end_date: '2026-08-16', sessions_per_week: 2 }),
        asg({ start_date: '2026-08-17', sessions_per_week: 3 }),
      ],
      FROM,
      TO
    )
    expect(Math.round(total)).toBe(10)
    expect(byWeek.get('2026-08-03')).toBeCloseTo(2, 5)
    expect(byWeek.get('2026-08-24')).toBeCloseTo(3, 5)
  })

  it('sin plan vigente no hay previsto: el hueco no cuenta como incumplimiento', async () => {
    const { expectedTrainingDays } = await import('./reportEngine')
    // Plan solo la última semana → previsto = 3, no 12
    const { total } = expectedTrainingDays(
      [asg({ start_date: '2026-08-24', sessions_per_week: 3 })],
      FROM,
      TO
    )
    expect(Math.round(total)).toBe(3)
  })

  it('evaluaciones y archived no suman previstos', async () => {
    const { expectedTrainingDays } = await import('./reportEngine')
    const { total } = expectedTrainingDays(
      [
        asg({ plan_type: 'evaluation', sessions_per_week: 5 }),
        asg({ status: 'archived', sessions_per_week: 5 }),
      ],
      FROM,
      TO
    )
    expect(total).toBe(0)
  })

  it('superposición en la transición: gana la asignación más nueva', async () => {
    const { expectedTrainingDays } = await import('./reportEngine')
    // Las dos vigentes el 2026-08-17: cuenta la de 3 días
    const { byWeek } = expectedTrainingDays(
      [
        asg({ start_date: '2026-01-01', end_date: '2026-08-17', sessions_per_week: 2 }),
        asg({ start_date: '2026-08-17', sessions_per_week: 3 }),
      ],
      '2026-08-17',
      '2026-08-17'
    )
    expect(byWeek.get('2026-08-17')).toBeCloseTo(3 / 7, 5)
  })

  it('buildReport expone compliancePct y previsto por semana, null sin asignaciones', () => {
    const rep = buildReport({
      from: FROM,
      to: TO,
      logs: [
        log({ date: '2026-08-04', exercise: EX_PRESS }),
        log({ date: '2026-08-06', exercise: EX_PRESS }),
        log({ date: '2026-08-11', exercise: EX_PRESS }),
        log({ date: '2026-08-13', exercise: EX_PRESS }),
      ],
      assignments: [asg({ sessions_per_week: 2 })],
      tagsByExercise: TAGS,
    })
    // 4 entrenados de 8 previstos = 50%
    expect(rep.attendance.expectedDays).toBe(8)
    expect(rep.attendance.compliancePct).toBe(50)
    // La semana prevista SIN entrenar aparece en 0, no desaparece
    const lastWeek = rep.attendance.weekly.find((w) => w.week === '2026-08-24')
    expect(lastWeek).toEqual({ week: '2026-08-24', days: 0, expected: 2 })

    const sinPlan = buildReport({ from: FROM, to: TO, logs: [], tagsByExercise: TAGS })
    expect(sinPlan.attendance.compliancePct).toBe(null)
  })
})
