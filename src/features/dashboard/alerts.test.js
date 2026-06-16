import { describe, it, expect } from 'vitest'
import {
  computeLowAdherence,
  computeInactiveStudents,
  computeFatigueStudents,
  computeStagnationByExercise,
  ALERT_THRESHOLDS,
} from './alerts'

// Helpers de fixtures
const trainingStudent = (id, name) => ({
  id,
  name,
  plan_assignments: [{ status: 'active', plan_type: 'training' }],
})

describe('computeLowAdherence', () => {
  const students = [
    trainingStudent('s1', 'Ana'),
    trainingStudent('s2', 'Beto'),
    trainingStudent('s3', 'Caro'),
    trainingStudent('s4', 'Dario'),
  ]

  it('dispara cuando la adherencia es <= 50%', () => {
    const map = new Map([
      ['s1', { target: 4, completed: 2 }], // 50% → dispara
      ['s2', { target: 4, completed: 3 }], // 75% → no
    ])
    const out = computeLowAdherence(students, map)
    expect(out.map((o) => o.studentId)).toEqual(['s1'])
    expect(out[0]).toMatchObject({ completed: 2, target: 4, pct: 50 })
  })

  it('no dispara por encima del umbral', () => {
    const map = new Map([['s2', { target: 4, completed: 3 }]])
    expect(computeLowAdherence(students, map)).toEqual([])
  })

  it('omite alumnos sin target válido o ausentes del map', () => {
    const map = new Map([
      ['s4', { target: 0, completed: 0 }], // sin denominador
    ])
    // s3 ni siquiera está en el map (sin plan training activo)
    expect(computeLowAdherence(students, map)).toEqual([])
  })

  it('ordena por peor adherencia primero', () => {
    const map = new Map([
      ['s1', { target: 4, completed: 2 }], // 50%
      ['s2', { target: 4, completed: 0 }], // 0%
    ])
    const out = computeLowAdherence(students, map)
    expect(out.map((o) => o.studentId)).toEqual(['s2', 's1'])
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
  it('mantiene el umbral de adherencia en 50% y días hábiles en 3', () => {
    expect(ALERT_THRESHOLDS.LOW_ADHERENCE_PCT).toBe(50)
    expect(ALERT_THRESHOLDS.INACTIVE_DAYS).toBe(3)
  })
})
