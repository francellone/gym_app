import { describe, it, expect } from 'vitest'
import {
  dayKey,
  isoWeekKey,
  streakKey,
  dayCelebrationLevel,
  detectDayMilestone,
  closedSessionDates,
  detectWeekMilestone,
  planAdherence,
  planTone,
  detectPlanMilestone,
  bestMetricOf,
  detectPersonalBest,
  bestCelebrationMode,
  checkOutlierValue,
  buildWeekStatuses,
  computeWeeklyStreak,
  isStreakCelebration,
  detectStreakMilestones,
  toAwardArgs,
  buildBestReferences,
  outlierFromReference,
} from './milestoneRules'

// ── fixtures ────────────────────────────────────────────────
const d = (s) => new Date(`${s}T12:00:00`)
const done = (id, date, extra = {}) => ({
  id: `${id}-${date}`,
  plan_exercise_id: id,
  logged_date: date,
  completed: true,
  status: 'done',
  ...extra,
})
const skipped = (id, date) => ({
  id: `${id}-${date}`,
  plan_exercise_id: id,
  logged_date: date,
  completed: false,
  status: 'skipped',
})
// Plan: activación (1 ejercicio) + Día A (3 ejercicios) + Día B (2 ejercicios)
const blocksBySection = {
  activation: [{ id: 'b0', block_type: 'strength', plan_exercises: [{ id: 'a1' }] }],
  day_a: [
    {
      id: 'b1',
      block_type: 'strength',
      plan_exercises: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }],
    },
  ],
  day_b: [{ id: 'b2', block_type: 'strength', plan_exercises: [{ id: 'y1' }, { id: 'y2' }] }],
}
const activeDays = ['day_a', 'day_b']
const flexible = (extra = {}) => ({
  id: 'asg-1',
  start_date: '2026-08-31',
  schedule_mode: 'flexible',
  plan: { sessions_per_week: 2 },
  status: 'active',
  ...extra,
})

// ── claves ──────────────────────────────────────────────────
describe('claves de período (mismo formato que los CHECK de v55)', () => {
  it('semana ISO idéntica a to_char(IYYY-"W"IW) de Postgres', () => {
    // Valores tomados de la base de producción el 2026-09-24.
    expect(isoWeekKey('2099-01-01')).toBe('2099-W01')
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
    expect(isoWeekKey('2026-09-24')).toBe('2026-W39')
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01')
    expect(isoWeekKey('2021-01-03')).toBe('2020-W53')
    expect(isoWeekKey('2026-09-27')).toBe('2026-W39') // domingo
    expect(isoWeekKey('2026-09-28')).toBe('2026-W40') // lunes
  })

  it('acepta Date y timestamps; rechaza basura', () => {
    expect(isoWeekKey(d('2026-09-24'))).toBe('2026-W39')
    expect(dayKey('2026-09-24T21:10:00Z')).toBe('2026-09-24')
    expect(dayKey('hoy')).toBeNull()
    expect(isoWeekKey(null)).toBeNull()
  })

  it('la racha lleva su semana de inicio (v55c)', () => {
    expect(streakKey('2026-W30', 4)).toBe('streak-2026-W30-4')
  })
})

// ── día ─────────────────────────────────────────────────────
describe('día', () => {
  it('nivel: completo celebra, parcial reconoce, el resto nada', () => {
    expect(dayCelebrationLevel('complete')).toBe('day_complete')
    expect(dayCelebrationLevel('partial')).toBe('day_partial')
    expect(dayCelebrationLevel('open')).toBeNull()
    expect(dayCelebrationLevel('none')).toBeNull()
  })

  it('hito solo en la transición a completo', () => {
    expect(
      detectDayMilestone({
        prevState: 'open',
        nextState: 'complete',
        date: '2026-09-24',
        dayId: 'day_a',
      })
    ).toEqual({ kind: 'day_complete', periodKey: '2026-09-24', payload: { day_id: 'day_a' } })
  })

  it('no hay hito al cargar un día que ya estaba completo, ni en parcial', () => {
    expect(
      detectDayMilestone({ prevState: 'complete', nextState: 'complete', date: '2026-09-24' })
    ).toBeNull()
    expect(
      detectDayMilestone({ prevState: 'open', nextState: 'partial', date: '2026-09-24' })
    ).toBeNull()
  })
})

// ── fechas cerradas ─────────────────────────────────────────
describe('closedSessionDates', () => {
  it('cuenta días completos y parciales, no los abiertos ni los de solo activación', () => {
    const logs = [
      // 09-01: Día A completo
      done('a1', '2026-09-01'),
      done('x1', '2026-09-01'),
      done('x2', '2026-09-01'),
      done('x3', '2026-09-01'),
      // 09-02: Día B parcial (una omisión)
      done('a1', '2026-09-02'),
      done('y1', '2026-09-02'),
      skipped('y2', '2026-09-02'),
      // 09-03: Día A abierto (falta uno)
      done('a1', '2026-09-03'),
      done('x1', '2026-09-03'),
      done('x2', '2026-09-03'),
      // 09-04: solo activación (caso Andrea)
      done('a1', '2026-09-04'),
    ]
    expect(closedSessionDates({ activeDays, blocksBySection, logs })).toEqual([
      '2026-09-01',
      '2026-09-02',
    ])
  })

  it('dos omisiones no cierran', () => {
    const logs = [
      done('a1', '2026-09-05'),
      done('x1', '2026-09-05'),
      skipped('x2', '2026-09-05'),
      skipped('x3', '2026-09-05'),
    ]
    expect(closedSessionDates({ activeDays, blocksBySection, logs })).toEqual([])
  })
})

// ── semana ──────────────────────────────────────────────────
describe('semana', () => {
  const today = d('2026-09-24')
  it('hito cuando la segunda sesión cierra la semana (2 por semana)', () => {
    const m = detectWeekMilestone({
      assignment: flexible(),
      prevDates: ['2026-09-21'],
      nextDates: ['2026-09-21', '2026-09-24'],
      date: '2026-09-24',
      today,
    })
    expect(m).toEqual({
      kind: 'week_complete',
      periodKey: '2026-W39',
      assignmentId: 'asg-1',
      payload: { expected: 2, completed: 2, week_start: '2026-09-21' },
    })
  })

  it('sin transición no hay hito (ya estaba completa, o todavía no)', () => {
    const a = flexible()
    expect(
      detectWeekMilestone({
        assignment: a,
        prevDates: ['2026-09-21', '2026-09-22'],
        nextDates: ['2026-09-21', '2026-09-22', '2026-09-24'],
        date: '2026-09-24',
        today,
      })
    ).toBeNull()
    expect(
      detectWeekMilestone({
        assignment: a,
        prevDates: [],
        nextDates: ['2026-09-24'],
        date: '2026-09-24',
        today,
      })
    ).toBeNull()
  })

  it('plan sin sesiones por semana no celebra', () => {
    const a = flexible({ plan: { sessions_per_week: 0 } })
    expect(
      detectWeekMilestone({
        assignment: a,
        prevDates: [],
        nextDates: ['2026-09-24'],
        date: '2026-09-24',
        today,
      })
    ).toBeNull()
  })
})

// ── plan ────────────────────────────────────────────────────
describe('plan', () => {
  const a = flexible({ start_date: '2026-09-01', expected_end_date: '2026-09-28' }) // 4 semanas × 2 = 8

  it('adherencia y tono', () => {
    const six = [
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
      '2026-09-15',
      '2026-09-17',
      '2026-10-02',
    ]
    expect(planAdherence({ assignment: a, closedDates: six })).toEqual({
      expected: 8,
      closed: 6,
      ratio: 0.75,
    })
    expect(planTone(0.95)).toBe('strong')
    expect(planTone(0.75)).toBe('good')
    expect(planTone(0.3)).toBe('gentle')
  })

  it('se celebra al completar la semana que contiene el vencimiento', () => {
    const m = detectPlanMilestone({
      assignment: a,
      closedDates: ['2026-09-01', '2026-09-02'],
      today: d('2026-09-28'),
      weekMilestone: { kind: 'week_complete', periodKey: isoWeekKey('2026-09-28') },
    })
    expect(m.kind).toBe('plan_complete')
    expect(m.periodKey).toBe('asg-1')
    expect(m.payload.trigger).toBe('last_week')
  })

  it('o al abrir la app después del vencimiento, con tono honesto', () => {
    const m = detectPlanMilestone({
      assignment: a,
      closedDates: ['2026-09-01'],
      today: d('2026-10-01'),
    })
    expect(m.payload).toMatchObject({
      trigger: 'expired',
      sessions_closed: 1,
      sessions_expected: 8,
      tone: 'gentle',
    })
  })

  it('no antes de tiempo, ni sin fecha de vencimiento, ni si se reemplazó antes', () => {
    expect(detectPlanMilestone({ assignment: a, today: d('2026-09-20') })).toBeNull()
    expect(detectPlanMilestone({ assignment: flexible(), today: d('2026-10-20') })).toBeNull()
    expect(
      detectPlanMilestone({ assignment: { ...a, status: 'replaced' }, today: d('2026-10-20') })
    ).toBeNull()
    expect(
      detectPlanMilestone({ assignment: { ...a, closed_at: '2026-09-15' }, today: d('2026-10-20') })
    ).toBeNull()
  })

  it('la semana completa de OTRA semana no dispara el plan', () => {
    expect(
      detectPlanMilestone({
        assignment: a,
        today: d('2026-09-17'),
        weekMilestone: { kind: 'week_complete', periodKey: '2026-W38' },
      })
    ).toBeNull()
  })
})

// ── mejores marcas ──────────────────────────────────────────
const wlog = (id, weight, date = '2026-09-01', extra = {}) => ({
  id,
  logged_date: date,
  completed: true,
  status: 'done',
  actual_weights_jsonb: [weight],
  actual_reps_jsonb: [10],
  ...extra,
})
const rlog = (id, reps) => ({
  id,
  completed: true,
  status: 'done',
  actual_reps_jsonb: [reps],
  actual_weights_jsonb: null,
})

describe('mejores marcas', () => {
  const history = [wlog('h1', 20), wlog('h2', 22.5), wlog('h3', 25)]

  it('métrica: peso si hay peso, si no reps', () => {
    expect(bestMetricOf(wlog('l', 30))).toEqual({ metric: 'weight', value: 30 })
    expect(bestMetricOf(rlog('l', 12))).toEqual({ metric: 'reps', value: 12 })
    expect(bestMetricOf(rlog('l', 0))).toBeNull()
  })

  it('marca: supera estrictamente el máximo con 3 registros previos', () => {
    const m = detectPersonalBest({ log: wlog('new', 27.5), history })
    expect(m).toEqual({
      kind: 'personal_best',
      periodKey: 'new',
      workoutLogId: 'new',
      payload: { metric: 'weight', value: 27.5, previous_max: 25, previous_count: 3 },
    })
  })

  it('igualar no es marca; con menos de 3 previos tampoco', () => {
    expect(detectPersonalBest({ log: wlog('new', 25), history })).toBeNull()
    expect(detectPersonalBest({ log: wlog('new', 40), history: history.slice(0, 2) })).toBeNull()
  })

  it('omitidos, el propio log y marcas anuladas no son referencia', () => {
    const noisy = [
      ...history,
      { ...wlog('sk', 99), completed: false, status: 'skipped' },
      wlog('typo', 250),
    ]
    expect(detectPersonalBest({ log: wlog('new', 27.5), history: noisy })).toBeNull() // 250 manda
    expect(
      detectPersonalBest({ log: wlog('new', 27.5), history: noisy, voidedLogIds: ['typo'] })
        ?.payload.previous_max
    ).toBe(25)
    expect(detectPersonalBest({ log: wlog('h3', 25), history })).toBeNull() // no se compara consigo
  })

  it('reps sin peso contra historia con peso: no comparable', () => {
    expect(detectPersonalBest({ log: rlog('new', 30), history })).toBeNull()
  })

  it('ejercicio de peso corporal: marca por reps', () => {
    const h = [rlog('r1', 8), rlog('r2', 10), rlog('r3', 9)]
    expect(detectPersonalBest({ log: rlog('new', 12), history: h })?.payload).toMatchObject({
      metric: 'reps',
      value: 12,
      previous_max: 10,
    })
  })

  it('un registro omitido nunca es marca', () => {
    expect(
      detectPersonalBest({
        log: { ...wlog('new', 50), completed: false, status: 'skipped' },
        history,
      })
    ).toBeNull()
  })

  it('una celebración por día: la primera se muestra, las demás suman', () => {
    expect(bestCelebrationMode({ bestsAlreadyToday: 0 })).toBe('toast')
    expect(bestCelebrationMode({ bestsAlreadyToday: 2 })).toBe('silent')
  })
})

describe('aviso al cargar (más del 100% del máximo previo)', () => {
  const history = [wlog('h1', 10), wlog('h2', 12), wlog('h3', 11)]
  it('avisa el caso real 12 → 28', () => {
    expect(checkOutlierValue({ value: 28, metric: 'weight', history })).toEqual({
      warn: true,
      previousMax: 12,
    })
  })
  it('no avisa hasta el doble justo, ni con poca historia', () => {
    expect(checkOutlierValue({ value: 24, metric: 'weight', history })).toEqual({ warn: false })
    expect(
      checkOutlierValue({ value: 35, metric: 'weight', history: history.slice(0, 1) })
    ).toEqual({ warn: false })
  })
  it('valores vacíos o cero no avisan', () => {
    expect(checkOutlierValue({ value: '', metric: 'weight', history })).toEqual({ warn: false })
    expect(checkOutlierValue({ value: 0, metric: 'weight', history })).toEqual({ warn: false })
  })
  it('al editar un registro no se compara consigo mismo', () => {
    const h = [...history, wlog('edit', 30)]
    expect(checkOutlierValue({ value: 28, metric: 'weight', history: h, logId: 'edit' }).warn).toBe(
      true
    )
  })
})

// ── racha ───────────────────────────────────────────────────
const wk = (statuses) =>
  statuses.map((status, i) => ({ weekKey: `2026-W${String(10 + i).padStart(2, '0')}`, status }))

describe('racha semanal', () => {
  it('cuenta semanas completas seguidas y guarda la semana de inicio', () => {
    expect(computeWeeklyStreak(wk(['complete', 'complete', 'complete']))).toMatchObject({
      streak: 3,
      startWeek: '2026-W10',
    })
  })

  it('neutral y semana en curso no cortan ni suman', () => {
    expect(computeWeeklyStreak(wk(['complete', 'neutral', 'complete', 'current'])).streak).toBe(2)
  })

  it('sin comodín, una semana incompleta corta', () => {
    const r = computeWeeklyStreak(wk(['complete', 'complete', 'incomplete', 'complete']))
    expect(r).toMatchObject({ streak: 1, startWeek: '2026-W13', freezeUsedWeeks: [] })
  })

  it('comodín: se gana a las 4 completas, salva una semana y la app sabe cuál', () => {
    const r = computeWeeklyStreak(
      wk(['complete', 'complete', 'complete', 'complete', 'incomplete', 'complete'])
    )
    expect(r).toMatchObject({
      streak: 5,
      freezes: 0,
      freezeUsedWeeks: ['2026-W14'],
      startWeek: '2026-W10',
    })
  })

  it('máximo un comodín guardado', () => {
    const r = computeWeeklyStreak(wk(Array(9).fill('complete')))
    expect(r.freezes).toBe(1)
  })

  it('dos incompletas seguidas con un solo comodín cortan', () => {
    const r = computeWeeklyStreak(
      wk(['complete', 'complete', 'complete', 'complete', 'incomplete', 'incomplete'])
    )
    expect(r.streak).toBe(0)
  })

  it('qué rachas se celebran: 2, 4, 8 y cada 4', () => {
    expect([1, 2, 3, 4, 5, 8, 10, 12, 16].map(isStreakCelebration)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      true,
    ])
  })

  it('candidatos: racha con clave por inicio y comodín usado en la última semana', () => {
    const weeks = wk(['complete', 'complete', 'complete', 'complete', 'incomplete'])
    const r = computeWeeklyStreak(weeks)
    expect(detectStreakMilestones(r, weeks)).toEqual([
      {
        kind: 'streak',
        periodKey: 'streak-2026-W10-4',
        payload: { weeks: 4, start_week: '2026-W10' },
      },
      { kind: 'streak_freeze_used', periodKey: '2026-W14', payload: { streak: 4 } },
    ])
  })

  it('una racha nueva después de cortar tiene otra clave (se vuelve a celebrar)', () => {
    const weeks = wk(['complete', 'complete', 'incomplete', 'complete', 'complete'])
    const r = computeWeeklyStreak(weeks)
    expect(detectStreakMilestones(r, weeks)[0].periodKey).toBe('streak-2026-W13-2')
  })
})

describe('buildWeekStatuses', () => {
  it('completa / incompleta / en curso / neutral según asignaciones y fechas cerradas', () => {
    const a = flexible({ start_date: '2026-09-07', closed_at: '2026-09-20' })
    const b = flexible({ id: 'asg-2', start_date: '2026-09-21' })
    const statuses = buildWeekStatuses({
      assignments: [a, b],
      closedDates: ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-22'],
      fromDate: '2026-08-31',
      today: d('2026-09-24'),
    })
    expect(statuses).toEqual([
      { weekKey: '2026-W36', status: 'neutral' },
      { weekKey: '2026-W37', status: 'complete' },
      { weekKey: '2026-W38', status: 'incomplete' },
      { weekKey: '2026-W39', status: 'current' },
    ])
  })

  it('plan vencido por fecha pero sin cerrar: la racha sigue midiendo', () => {
    const a = flexible({ start_date: '2026-09-07', expected_end_date: '2026-09-13' })
    const statuses = buildWeekStatuses({
      assignments: [a],
      closedDates: ['2026-09-15', '2026-09-17'],
      fromDate: '2026-09-14',
      today: d('2026-09-24'),
    })
    expect(statuses[0]).toEqual({ weekKey: '2026-W38', status: 'complete' })
  })
})

describe('toAwardArgs', () => {
  it('mapea el candidato a los parámetros de award_milestone', () => {
    expect(
      toAwardArgs('s1', {
        kind: 'personal_best',
        periodKey: 'l1',
        workoutLogId: 'l1',
        payload: { value: 30 },
      })
    ).toEqual({
      p_student_id: 's1',
      p_kind: 'personal_best',
      p_period_key: 'l1',
      p_payload: { value: 30 },
      p_assignment_id: null,
      p_workout_log_id: 'l1',
    })
  })
})

describe('unidades de la marca', () => {
  const slog = (id, secs, unit = 'segundos') => ({
    id,
    completed: true,
    status: 'done',
    actual_reps_jsonb: [secs],
    reps_unit: unit,
  })
  it('segundos compiten entre sí', () => {
    const h = [slog('a', 30), slog('b', 40), slog('c', 35)]
    expect(detectPersonalBest({ log: slog('n', 45), history: h })?.payload).toMatchObject({
      metric: 'seconds',
      value: 45,
    })
  })
  it('pasos y respiraciones no son marca', () => {
    const h = [slog('a', 30, 'pasos'), slog('b', 40, 'pasos'), slog('c', 35, 'pasos')]
    expect(detectPersonalBest({ log: slog('n', 90, 'pasos'), history: h })).toBeNull()
  })
  it('segundos contra historia en reps: no comparable', () => {
    const h = [slog('a', 10, 'reps'), slog('b', 12, 'reps'), slog('c', 11, 'reps')]
    expect(detectPersonalBest({ log: slog('n', 60), history: h })).toBeNull()
  })
})

describe('buildBestReferences + outlierFromReference', () => {
  const row = (id, ex, w, extra = {}) => ({
    id,
    exercise_id: ex,
    completed: true,
    status: 'done',
    actual_weights_jsonb: [w],
    actual_reps_jsonb: [10],
    ...extra,
  })
  it('máximo y cantidad por ejercicio y métrica; sin omitidos ni anuladas; lee el id embebido', () => {
    const refs = buildBestReferences(
      [
        row('a', 'ex1', 10),
        row('b', 'ex1', 12),
        row('c', 'ex1', 11),
        row('d', 'ex1', 99),
        { ...row('e', 'ex1', 80), completed: false, status: 'skipped' },
        {
          id: 'f',
          plan_exercise: { exercise_id: 'ex2' },
          completed: true,
          status: 'done',
          actual_weights_jsonb: [5],
          actual_reps_jsonb: [8],
        },
      ],
      { voidedLogIds: ['d'] }
    )
    expect(refs.get('ex1').weight).toEqual({ count: 3, max: 12 })
    expect(refs.get('ex2').weight).toEqual({ count: 1, max: 5 })
  })
  it('avisa por encima del doble con 3 previos', () => {
    expect(outlierFromReference({ value: 28, reference: { count: 3, max: 12 } })).toEqual({
      warn: true,
      previousMax: 12,
    })
    expect(outlierFromReference({ value: 24, reference: { count: 3, max: 12 } }).warn).toBe(false)
    expect(outlierFromReference({ value: 50, reference: { count: 2, max: 12 } }).warn).toBe(false)
    expect(outlierFromReference({ value: 50, reference: null }).warn).toBe(false)
  })
})
