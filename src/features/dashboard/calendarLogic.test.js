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
