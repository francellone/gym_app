import { describe, it, expect } from 'vitest'
import {
  computeLowAdherence,
  computeAdherenceDecline,
  computeInactiveStudents,
  computeFatigueStudents,
  computeStagnationByExercise,
  ALERT_THRESHOLDS,
} from './alerts'

// Construye una semana cerrada {weekStart, completed, target, pct}
const wk = (weekStart, completed, target) => ({
  weekStart,
  completed,
  target,
  pct: Math.round((Math.min(completed, target) / target) * 100),
})

// Helpers de fixtures
const trainingStudent = (id, name) => ({
  id,
  name,
  plan_assignments: [{ status: 'active', plan_type: 'training' }],
})

describe('computeLowAdherence (última semana cerrada, umbral <100%)', () => {
  const students = [
    trainingStudent('s1', 'Ana'),
    trainingStudent('s2', 'Beto'),
    trainingStudent('s3', 'Caro'),
  ]

  it('dispara si la última semana cerrada quedó por debajo de 100%', () => {
    const weekly = new Map([
      ['s1', [wk('2026-06-01', 3, 3), wk('2026-06-08', 2, 3)]], // última 67% → dispara
      ['s2', [wk('2026-06-08', 3, 3)]], // última 100% → no
    ])
    const out = computeLowAdherence(students, weekly)
    expect(out.map((o) => o.studentId)).toEqual(['s1'])
    expect(out[0]).toMatchObject({ completed: 2, target: 3, pct: 67 })
  })

  it('no dispara con la última semana al 100%', () => {
    const weekly = new Map([['s2', [wk('2026-06-08', 4, 4)]]])
    expect(computeLowAdherence(students, weekly)).toEqual([])
  })

  it('omite alumnos sin semanas cerradas', () => {
    const weekly = new Map([['s3', []]])
    expect(computeLowAdherence(students, weekly)).toEqual([])
  })

  it('usa la ÚLTIMA semana, no las previas', () => {
    const weekly = new Map([
      ['s1', [wk('2026-06-01', 0, 3), wk('2026-06-08', 3, 3)]], // última 100% → no
    ])
    expect(computeLowAdherence(students, weekly)).toEqual([])
  })
})

describe('computeAdherenceDecline (caída sostenida)', () => {
  const students = [trainingStudent('s1', 'Ana'), trainingStudent('s2', 'Beto')]

  it('dispara con 3 semanas en baja estricta', () => {
    const weekly = new Map([
      ['s1', [wk('2026-05-25', 3, 3), wk('2026-06-01', 2, 3), wk('2026-06-08', 1, 3)]], // 100→67→33
    ])
    const out = computeAdherenceDecline(students, weekly)
    expect(out.map((o) => o.studentId)).toEqual(['s1'])
    expect(out[0].trend).toEqual([100, 67, 33])
  })

  it('no dispara si una semana se mantuvo o subió', () => {
    const weekly = new Map([
      ['s2', [wk('2026-05-25', 3, 3), wk('2026-06-01', 3, 3), wk('2026-06-08', 2, 3)]], // 100→100→67 (no estricta)
    ])
    expect(computeAdherenceDecline(students, weekly)).toEqual([])
  })

  it('no dispara con menos semanas que el mínimo', () => {
    const weekly = new Map([['s1', [wk('2026-06-01', 3, 3), wk('2026-06-08', 1, 3)]]])
    expect(computeAdherenceDecline(students, weekly)).toEqual([])
  })
})

describe('computeInactiveStudents (días hábiles)', () => {
  const students = [trainingStudent('s1', 'Ana')]

  it('NO marca si el hueco son solo días de finde (viernes → lunes = 1 hábil)', () => {
    const map = new Map([['s1', '2026-06-12']]) // viernes
    const today = new Date(2026, 5, 15) // lunes
    expect(computeInactiveStudents(students, map, today)).toEqual([])
  })

  it('marca a los 3 días hábiles (viernes → miércoles)', () => {
    const map = new Map([['s1', '2026-06-12']]) // viernes
    const today = new Date(2026, 5, 17) // miércoles → lun/mar/mié = 3 hábiles
    const out = computeInactiveStudents(students, map, today)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      studentId: 's1',
      daysSinceLastLog: 5, // corridos, para mostrar
      businessDaysSinceLastLog: 3,
    })
  })

  it('ignora alumnos sin plan de training activo', () => {
    const noPlan = [{ id: 's9', name: 'Sin Plan', plan_assignments: [] }]
    const map = new Map() // nunca logueó
    const today = new Date(2026, 5, 17)
    expect(computeInactiveStudents(noPlan, map, today)).toEqual([])
  })

  it('marca con Infinity al alumno con plan que nunca logueó', () => {
    const map = new Map()
    const today = new Date(2026, 5, 17)
    const out = computeInactiveStudents(students, map, today)
    expect(out[0]).toMatchObject({ studentId: 's1', daysSinceLastLog: Infinity })
  })
})

describe('computeFatigueStudents', () => {
  it('dispara con energía baja sostenida (3+ días en la ventana)', () => {
    const students = [{ id: 's1', name: 'Ana' }]
    const today = new Date(2026, 5, 17)
    const wb = [
      { user_id: 's1', date: '2026-06-15', energy_level: 3 },
      { user_id: 's1', date: '2026-06-14', energy_level: 4 },
      { user_id: 's1', date: '2026-06-13', energy_level: 2 },
    ]
    const out = computeFatigueStudents(students, wb, today)
    expect(out).toHaveLength(1)
    expect(out[0].lowEnergyDays).toBe(3)
  })

  it('no dispara con menos días que el umbral', () => {
    const students = [{ id: 's1', name: 'Ana' }]
    const today = new Date(2026, 5, 17)
    const wb = [{ user_id: 's1', date: '2026-06-15', energy_level: 3 }]
    expect(computeFatigueStudents(students, wb, today)).toEqual([])
  })
})

describe('computeStagnationByExercise', () => {
  it('marca un ejercicio sin progreso de peso entre mitades de la ventana', () => {
    const students = [{ id: 's1', name: 'Ana' }]
    const today = new Date(2026, 5, 17)
    const ex = { exercise: { id: 'e1', name: 'Sentadilla' } }
    const recentLogs = [
      { student_id: 's1', logged_date: '2026-06-01', actual_weight: 50, plan_exercise: ex },
      { student_id: 's1', logged_date: '2026-06-03', actual_weight: 50, plan_exercise: ex },
      { student_id: 's1', logged_date: '2026-06-12', actual_weight: 50, plan_exercise: ex },
      { student_id: 's1', logged_date: '2026-06-15', actual_weight: 50, plan_exercise: ex },
    ]
    const out = computeStagnationByExercise(students, recentLogs, today)
    expect(out).toHaveLength(1)
    expect(out[0].stagnantExercises[0]).toMatchObject({
      exerciseId: 'e1',
      exerciseName: 'Sentadilla',
    })
  })

  it('NO marca si el peso subió en la segunda mitad', () => {
    const students = [{ id: 's1', name: 'Ana' }]
    const today = new Date(2026, 5, 17)
    const ex = { exercise: { id: 'e1', name: 'Sentadilla' } }
    const recentLogs = [
      { student_id: 's1', logged_date: '2026-06-01', actual_weight: 50, plan_exercise: ex },
      { student_id: 's1', logged_date: '2026-06-03', actual_weight: 50, plan_exercise: ex },
      { student_id: 's1', logged_date: '2026-06-15', actual_weight: 60, plan_exercise: ex },
    ]
    expect(computeStagnationByExercise(students, recentLogs, today)).toEqual([])
  })
})

describe('ALERT_THRESHOLDS', () => {
  it('mantiene umbral de adherencia <100%, declive 3 semanas y días hábiles 3', () => {
    expect(ALERT_THRESHOLDS.ADHERENCE_LOW_PCT).toBe(100)
    expect(ALERT_THRESHOLDS.ADHERENCE_DECLINE_WEEKS).toBe(3)
    expect(ALERT_THRESHOLDS.INACTIVE_DAYS).toBe(3)
  })
})
