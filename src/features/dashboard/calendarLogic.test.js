// ============================================================
// calendarLogic.test.js — estado de día por alumno en el calendario
// ------------------------------------------------------------
// Foco: completo vs parcial (2026-08-27). Antes cualquier día con
// sesión registrada se pintaba "Cumplido" en verde, así que Andrea
// —que entrenaba solo la activación— le figuraba cumplida a la coach.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  computeStudentDayStatus,
  STUDENT_DAY_STYLE,
  computeCalendarEvents,
  buildAgendaDays,
  agendaPhrase,
} from './calendarLogic'

const TODAY = new Date(2026, 7, 27) // jueves 2026-08-27
const YMD = '2026-08-24'

describe('computeStudentDayStatus — modo flexible', () => {
  const opts = { scheduleMode: 'flexible' }

  it('día entrenado y completo → Cumplido', () => {
    expect(computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, opts)).toBe(
      'planned_done'
    )
  })

  it('día entrenado a medias → Parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('planned_partial')
  })

  it('día extra a medias → Día extra parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        flexibleOverflowSet: new Set([YMD]),
        partialSet: new Set([YMD]),
      })
    ).toBe('unplanned_partial')
  })

  it('sin partialSet mantiene el comportamiento anterior', () => {
    expect(computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, opts)).toBe(
      'planned_done'
    )
  })

  it('un día sin sesión sigue siendo descanso aunque esté en partialSet', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set(), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('rest')
  })
})

describe('computeStudentDayStatus — modo fixed', () => {
  const opts = { scheduleMode: 'fixed' }

  it('día esperado y entrenado a medias → Parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set([YMD]), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('planned_partial')
  })

  it('día NO esperado entrenado a medias → Día extra parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('unplanned_partial')
  })

  it('el parcial no pisa a "no asistió" ni a "próximo"', () => {
    const partialSet = new Set(['2026-08-25', '2026-08-31'])
    expect(
      computeStudentDayStatus('2026-08-25', new Set(['2026-08-25']), new Set(), TODAY, {
        ...opts,
        partialSet,
      })
    ).toBe('planned_missed')
    expect(
      computeStudentDayStatus('2026-08-31', new Set(['2026-08-31']), new Set(), TODAY, {
        ...opts,
        partialSet,
      })
    ).toBe('planned_future')
  })
})

describe('STUDENT_DAY_STYLE', () => {
  it('todos los estados que devuelve la función tienen estilo y etiqueta', () => {
    for (const status of [
      'planned_done',
      'planned_partial',
      'planned_missed',
      'planned_future',
      'unplanned_done',
      'unplanned_partial',
      'rest',
    ]) {
      expect(STUDENT_DAY_STYLE[status]).toBeTruthy()
      expect(STUDENT_DAY_STYLE[status].label).toBeTruthy()
    }
  })
})

// ============================================================
// Eventos del calendario del coach (v48/v50b)
// ------------------------------------------------------------
// El evento "Vence" salía de end_date (cierre) y nunca se pintaba.
// Ahora sale de expected_end_date, y SOLO en asignaciones vigentes:
// una reemplazada conserva su vencimiento previsto y pintaría un plan
// que ya nadie entrena.
// ============================================================
describe('computeCalendarEvents — vencimiento del plan', () => {
  const win = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) }
  const alumnos = [{ id: 's1', name: 'Ana' }]
  const asg = (props) => ({
    id: 'a1',
    student_id: 's1',
    start_date: '2026-08-01',
    plan: { title: 'Fuerza' },
    ...props,
  })
  const tipos = (map, ymd) => (map.get(ymd) || []).map((e) => e.type)

  it('pinta el vencimiento de un plan activo', () => {
    const map = computeCalendarEvents(
      alumnos,
      [asg({ status: 'active', expected_end_date: '2026-09-15' })],
      win
    )
    expect(tipos(map, '2026-09-15')).toContain('plan_end')
    expect(map.get('2026-09-15')[0].title).toBe('Vence Fuerza')
  })

  it('NO pinta el de una asignación reemplazada', () => {
    const map = computeCalendarEvents(
      alumnos,
      [asg({ status: 'replaced', expected_end_date: '2026-09-15', closed_at: '2026-08-20' })],
      win
    )
    expect(tipos(map, '2026-09-15')).not.toContain('plan_end')
  })

  it('el cierre real no genera evento', () => {
    const map = computeCalendarEvents(
      alumnos,
      [asg({ status: 'active', expected_end_date: null, closed_at: '2026-09-10' })],
      win
    )
    expect(tipos(map, '2026-09-10')).not.toContain('plan_end')
  })

  it('el vencimiento de pago sigue siendo otro evento', () => {
    const map = computeCalendarEvents(
      [{ id: 's1', name: 'Ana', next_payment_due: '2026-09-12' }],
      [asg({ status: 'active', expected_end_date: '2026-09-12' })],
      win
    )
    expect(tipos(map, '2026-09-12').sort()).toEqual(['payment_due', 'plan_end'])
  })
})

describe('rediseño 2026-09-26: evaluaciones, atrasos y agenda', () => {
  const win = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 4) }
  const hoy = new Date(2026, 8, 26)
  const personas = [
    { id: 's1', name: 'Ana', next_payment_due: '2026-09-15' },
    { id: 's2', name: 'Bea', next_payment_due: '2026-09-30' },
  ]

  it('una evaluación pendiente genera evento "evaluation" y no inicio de plan', () => {
    const map = computeCalendarEvents(
      personas,
      [
        {
          id: 'e1',
          student_id: 's1',
          start_date: '2026-09-28',
          status: 'active',
          plan_type: 'evaluation',
          plan: { title: 'Test' },
        },
      ],
      win,
      hoy
    )
    expect((map.get('2026-09-28') || []).map((e) => e.type)).toEqual(['evaluation'])
  })

  it('una evaluación completada no aparece', () => {
    const map = computeCalendarEvents(
      personas,
      [
        {
          id: 'e1',
          student_id: 's1',
          start_date: '2026-09-28',
          status: 'completed',
          plan_type: 'evaluation',
          plan: { title: 'Test' },
        },
      ],
      win,
      hoy
    )
    expect(map.get('2026-09-28')).toBeUndefined()
  })

  const evalAsg = (props) => ({
    id: 'e1',
    student_id: 's1',
    plan_id: 'p1',
    start_date: '2026-09-20',
    status: 'active',
    plan_type: 'evaluation',
    plan: { title: 'Test 1RM' },
    ...props,
  })

  it('la evaluación hecha aparece en el día en que se hizo, no en la agendada', () => {
    const map = computeCalendarEvents(personas, [evalAsg({ status: 'completed' })], win, hoy, [
      { student_id: 's1', plan_id: 'p1', eval_date: '2026-09-23' },
    ])
    expect(map.get('2026-09-20')).toBeUndefined()
    const ev = map.get('2026-09-23')
    expect(ev.map((e) => e.type)).toEqual(['evaluation_done'])
    expect(ev[0].studentName).toBe('Ana')
    expect(ev[0].planTitle).toBe('Test 1RM')
  })

  it('un resultado apaga el pendiente aunque la asignación siga activa', () => {
    const map = computeCalendarEvents(personas, [evalAsg()], win, hoy, [
      { student_id: 's1', plan_id: 'p1', eval_date: '2026-09-22' },
    ])
    expect(map.get('2026-09-20')).toBeUndefined()
    expect(map.get('2026-09-22').map((e) => e.type)).toEqual(['evaluation_done'])
  })

  it('varias filas del mismo día y plan son un solo evento; personas fuera de la lista no', () => {
    const map = computeCalendarEvents(personas, [], win, hoy, [
      { student_id: 's1', plan_id: 'p1', eval_date: '2026-09-23' },
      { student_id: 's1', plan_id: 'p1', eval_date: '2026-09-23' },
      { student_id: 'inactiva', plan_id: 'p9', eval_date: '2026-09-23' },
    ])
    expect(map.get('2026-09-23')).toHaveLength(1)
  })

  it('la evaluación pendiente con fecha pasada va atrasada; la futura no', () => {
    const map = computeCalendarEvents(
      personas,
      [evalAsg(), evalAsg({ id: 'e2', plan_id: 'p2', start_date: '2026-09-29' })],
      win,
      hoy
    )
    expect(map.get('2026-09-20')[0].late).toBe(true)
    expect(map.get('2026-09-29')[0].late).toBe(false)
  })

  it('la agenda no muestra evaluaciones ya hechas', () => {
    const map = computeCalendarEvents([{ id: 's1', name: 'Ana' }], [], win, hoy, [
      { student_id: 's1', plan_id: 'p1', eval_date: '2026-09-26' },
    ])
    expect(buildAgendaDays(map, hoy, 7)).toEqual([])
    expect(agendaPhrase(map.get('2026-09-26')[0])).toEqual({
      lead: 'Evaluó',
      name: 'Ana',
      detail: 'Evaluación',
    })
  })

  it('marca como atrasado el pago que ya pasó y no el que viene', () => {
    const map = computeCalendarEvents(personas, [], win, hoy)
    expect(map.get('2026-09-15')[0].late).toBe(true)
    expect(map.get('2026-09-30')[0].late).toBe(false)
  })

  it('la agenda arma solo los días con eventos, en orden, y filtra por persona', () => {
    const map = computeCalendarEvents(personas, [], win, hoy)
    const dias = buildAgendaDays(map, hoy, 7)
    expect(dias.map((d) => d.ymd)).toEqual(['2026-09-30'])
    expect(buildAgendaDays(map, hoy, 7, 's1')).toEqual([])
  })

  it('la frase de la agenda dice qué pasa y con quién', () => {
    expect(agendaPhrase({ type: 'payment_due', studentName: 'Bea', late: false })).toEqual({
      lead: 'Vence el pago de',
      name: 'Bea',
      detail: '',
    })
    expect(agendaPhrase({ type: 'payment_due', studentName: 'Ana', late: true }).lead).toBe(
      'Pago vencido de'
    )
  })
})

// ============================================================
// 2026-09-27 — formularios, pagos cobrados, actividades y festejos.
// Regla de Franco: cada formulario aparece UNA sola vez según su estado.
// ============================================================
describe('computeCalendarEvents — formularios, uno por estado', () => {
  const today = new Date(2026, 8, 27) // domingo 27/09
  const win = { start: new Date(2026, 7, 31), end: new Date(2026, 9, 4) }
  const students = [{ id: 's1', name: 'Ana Paz' }]
  const run = (forms) => computeCalendarEvents(students, [], win, today, [], { forms })
  const all = (map) => [...map.values()].flat()

  it('programado a futuro → solo "programado" en su fecha', () => {
    const ev = all(
      run([
        {
          id: 'f1',
          student_id: 's1',
          status: 'scheduled',
          scheduled_for: '2026-10-02T12:00:00Z',
          sent_at: null,
          completed_at: null,
          template: { name: 'Mensual' },
        },
      ])
    )
    expect(ev.map((e) => [e.type, e.date])).toEqual([['form_scheduled', '2026-10-02']])
    expect(ev[0].planTitle).toBe('Mensual')
  })

  it('llegó el día y no respondió → solo "sin responder" en el día del envío', () => {
    const ev = all(
      run([
        {
          id: 'f2',
          student_id: 's1',
          status: 'pending',
          scheduled_for: null,
          sent_at: '2026-09-10T15:00:00Z',
          completed_at: null,
        },
      ])
    )
    expect(ev.map((e) => e.type)).toEqual(['form_unanswered'])
    expect(ev[0].date).toBe('2026-09-10')
    expect(ev[0].daysWaiting).toBe(17)
    expect(ev[0].late).toBe(true)
  })

  it('menos de 7 días sin responder → no se marca demorado', () => {
    const ev = all(
      run([{ id: 'f3', student_id: 's1', status: 'pending', sent_at: '2026-09-24T15:00:00Z' }])
    )
    expect(ev[0].type).toBe('form_unanswered')
    expect(ev[0].late).toBe(false)
  })

  it('respondido → solo "respondido" en el día de la respuesta (no el del envío)', () => {
    const ev = all(
      run([
        {
          id: 'f4',
          student_id: 's1',
          status: 'completed',
          sent_at: '2026-09-18T15:00:00Z',
          completed_at: '2026-09-21T15:00:00Z',
        },
      ])
    )
    expect(ev.map((e) => [e.type, e.date])).toEqual([['form_answered', '2026-09-21']])
  })

  it('formularios de personas fuera de la lista no aparecen', () => {
    const ev = all(
      run([{ id: 'f5', student_id: 'otra', status: 'pending', sent_at: '2026-09-20T15:00:00Z' }])
    )
    expect(ev).toEqual([])
  })
})

describe('computeCalendarEvents — pagos cobrados, actividades y festejos', () => {
  const today = new Date(2026, 8, 27)
  const win = { start: new Date(2026, 7, 31), end: new Date(2026, 9, 4) }
  const students = [{ id: 's1', name: 'Ana Paz' }]

  it('pago cobrado en su día, una vez por persona y día', () => {
    const map = computeCalendarEvents(students, [], win, today, [], {
      payments: [
        { student_id: 's1', paid_on: '2026-09-15' },
        { student_id: 's1', paid_on: '2026-09-15' },
      ],
    })
    expect(map.get('2026-09-15').map((e) => e.type)).toEqual(['payment_done'])
  })

  it('actividad extra lleva su emoji y nombre', () => {
    const map = computeCalendarEvents(students, [], win, today, [], {
      activities: [{ student_id: 's1', date: '2026-09-20', emoji: '⚽', name: 'Fútbol' }],
    })
    const [ev] = map.get('2026-09-20')
    expect(ev.type).toBe('activity')
    expect(agendaPhrase(ev).lead).toBe('⚽ Fútbol:')
  })

  it('festejos: semana completa sí, día completo no, anulados no', () => {
    const map = computeCalendarEvents(students, [], win, today, [], {
      milestones: [
        { student_id: 's1', kind: 'week_complete', created_at: '2026-09-21T15:00:00Z' },
        { student_id: 's1', kind: 'day_complete', created_at: '2026-09-21T15:00:00Z' },
        {
          student_id: 's1',
          kind: 'personal_best',
          created_at: '2026-09-22T15:00:00Z',
          voided_at: '2026-09-23T10:00:00Z',
        },
      ],
    })
    const ev = [...map.values()].flat()
    expect(ev.map((e) => [e.type, e.planTitle])).toEqual([['milestone', 'Semana completa']])
  })

  it('la agenda no muestra lo que ya pasó y respeta lo apagado', () => {
    const map = computeCalendarEvents(students, [], win, today, [], {
      forms: [
        { id: 'a', student_id: 's1', status: 'scheduled', scheduled_for: '2026-09-29T12:00:00Z' },
      ],
      payments: [{ student_id: 's1', paid_on: '2026-09-28' }],
    })
    const days = buildAgendaDays(map, today, 7)
    expect(days.flatMap((d) => d.events.map((e) => e.type))).toEqual(['form_scheduled'])
    expect(buildAgendaDays(map, today, 7, null, new Set(['form_scheduled']))).toEqual([])
  })
})
