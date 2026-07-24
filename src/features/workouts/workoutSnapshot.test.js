import { describe, it, expect, beforeEach } from 'vitest'
import {
  snapshotKey,
  readWorkoutSnapshot,
  writeWorkoutSnapshot,
  clearWorkoutSnapshots,
} from './workoutSnapshot'

const S = 'student-1'
const D = '2026-07-24'

function sampleData(extra = {}) {
  return {
    assignment: { plan_id: 'p1' },
    planExercises: [{ id: 'e1' }],
    planBlocks: [],
    logs: { e1: { id: 'l1', completed: true } },
    blockLogs: {},
    session: null,
    recentLogs: [],
    recentExerciseLogs: [],
    recentBlockLogs: [],
    prescriptionByEx: {},
    exerciseNotes: [],
    threadId: 't1',
    activeDay: 'day_b',
    wellbeing: null,
    studentName: '',
    ...extra,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('snapshotKey', () => {
  it('arma la clave scopeada por alumno+fecha', () => {
    expect(snapshotKey({ studentId: S, selectedDate: D })).toBe(
      `gym_app:workout_snapshot:v1:${S}:${D}`
    )
  })
  it('devuelve null si falta algún dato', () => {
    expect(snapshotKey({ studentId: S })).toBeNull()
    expect(snapshotKey({ selectedDate: D })).toBeNull()
    expect(snapshotKey({})).toBeNull()
  })
})

describe('write + read round-trip', () => {
  it('devuelve exactamente lo guardado para el mismo alumno+fecha', () => {
    const data = sampleData()
    expect(writeWorkoutSnapshot({ studentId: S, selectedDate: D, data })).toBe(true)
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: D })).toEqual(data)
  })

  it('no lee snapshot de otra fecha', () => {
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: sampleData() })
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: '2026-07-25' })).toBeNull()
  })

  it('no lee snapshot de otro alumno', () => {
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: sampleData() })
    expect(readWorkoutSnapshot({ studentId: 'student-2', selectedDate: D })).toBeNull()
  })

  it('devuelve null si no hay nada', () => {
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: D })).toBeNull()
  })
})

describe('TTL', () => {
  it('no pinta un snapshot más viejo que 36h', () => {
    const t0 = 1_000_000_000_000
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: sampleData(), now: t0 })
    // 35h después: sigue válido
    expect(
      readWorkoutSnapshot({ studentId: S, selectedDate: D, now: t0 + 35 * 3600 * 1000 })
    ).not.toBeNull()
    // 37h después: expirado
    expect(
      readWorkoutSnapshot({ studentId: S, selectedDate: D, now: t0 + 37 * 3600 * 1000 })
    ).toBeNull()
  })
})

describe('un solo snapshot a la vez', () => {
  it('al escribir uno nuevo, barre los de otras fechas', () => {
    writeWorkoutSnapshot({ studentId: S, selectedDate: '2026-07-23', data: sampleData() })
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: sampleData() })
    // El viejo se borró
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: '2026-07-23' })).toBeNull()
    // El nuevo está
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: D })).not.toBeNull()
    // Sólo una clave de snapshot en storage
    const keys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('gym_app:workout_snapshot:v1:')
    )
    expect(keys).toHaveLength(1)
  })
})

describe('guard de cuota', () => {
  it('recorta arrays secundarios cuando el snapshot es enorme, preservando lo primario', () => {
    const huge = 'x'.repeat(2_000_000)
    const data = sampleData({
      recentExerciseLogs: [{ blob: huge }],
      exerciseNotes: [{ blob: huge }],
    })
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data })
    const read = readWorkoutSnapshot({ studentId: S, selectedDate: D })
    expect(read).not.toBeNull()
    // Secundarios recortados
    expect(read.recentExerciseLogs).toEqual([])
    expect(read.exerciseNotes).toEqual([])
    // Primario preservado
    expect(read.planExercises).toEqual([{ id: 'e1' }])
    expect(read.activeDay).toBe('day_b')
  })
})

describe('clearWorkoutSnapshots', () => {
  it('borra todos los snapshots', () => {
    writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: sampleData() })
    writeWorkoutSnapshot({ studentId: 'student-2', selectedDate: D, data: sampleData() })
    clearWorkoutSnapshots()
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: D })).toBeNull()
    expect(readWorkoutSnapshot({ studentId: 'student-2', selectedDate: D })).toBeNull()
  })
})

describe('guards defensivos', () => {
  it('write con data nula devuelve false', () => {
    expect(writeWorkoutSnapshot({ studentId: S, selectedDate: D, data: null })).toBe(false)
  })
  it('read tolera JSON corrupto', () => {
    window.localStorage.setItem(`gym_app:workout_snapshot:v1:${S}:${D}`, '{no json')
    expect(readWorkoutSnapshot({ studentId: S, selectedDate: D })).toBeNull()
  })
})
