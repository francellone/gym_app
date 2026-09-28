import { describe, it, expect } from 'vitest'
import {
  COMPLETE_THRESHOLD,
  isLogSkipped,
  isLogDone,
  isLogResolved,
  isTrainingActivity,
  tallyResolution,
  mergeTallies,
  dayStateFromTally,
  isDayStateClosed,
  summarizeEntries,
  describeSkips,
} from './completionRules'

const DONE = { completed: true, status: 'done' }
const DONE_LEGACY = { completed: true } // registros anteriores a v54: sin status
const SKIPPED = { completed: false, status: 'skipped', skip_reason: 'time' }
const OPEN = { completed: false, status: 'done' } // guardado pero no marcado (no pasa en prod)

describe('predicados de un registro', () => {
  it('hecho: completed y no omitido; los registros pre-v54 sin status cuentan como hechos', () => {
    expect(isLogDone(DONE)).toBe(true)
    expect(isLogDone(DONE_LEGACY)).toBe(true)
    expect(isLogDone(SKIPPED)).toBe(false)
    expect(isLogDone(OPEN)).toBe(false)
    expect(isLogDone(undefined)).toBe(false)
  })

  it('defensa: una fila con completed=true y status=skipped NO es hecha', () => {
    // La base lo prohíbe con un CHECK; el front puede tener estado a medio camino.
    expect(isLogDone({ completed: true, status: 'skipped' })).toBe(false)
    expect(isLogSkipped({ completed: true, status: 'skipped' })).toBe(true)
  })

  it('resuelto = hecho u omitido', () => {
    expect(isLogResolved(DONE)).toBe(true)
    expect(isLogResolved(SKIPPED)).toBe(true)
    expect(isLogResolved(OPEN)).toBe(false)
    expect(isLogResolved(null)).toBe(false)
  })

  it('una omisión declarada no es actividad', () => {
    expect(isTrainingActivity(DONE)).toBe(true)
    expect(isTrainingActivity(DONE_LEGACY)).toBe(true)
    expect(isTrainingActivity(SKIPPED)).toBe(false)
    expect(isTrainingActivity(undefined)).toBe(false)
  })
})

describe('tallyResolution', () => {
  it('cuenta hechos, omitidos y resueltos sobre el total esperado', () => {
    expect(tallyResolution([DONE, DONE, SKIPPED, undefined, OPEN], 5)).toEqual({
      total: 5,
      done: 2,
      skipped: 1,
      resolved: 3,
    })
  })

  it('sin total explícito usa el largo de la lista', () => {
    expect(tallyResolution([DONE, SKIPPED])).toEqual({ total: 2, done: 1, skipped: 1, resolved: 2 })
  })

  it('tolera vacíos', () => {
    expect(tallyResolution()).toEqual({ total: 0, done: 0, skipped: 0, resolved: 0 })
    expect(tallyResolution(null, 3)).toEqual({ total: 3, done: 0, skipped: 0, resolved: 0 })
  })
})

describe('mergeTallies', () => {
  it('suma activación + día', () => {
    expect(
      mergeTallies({ total: 3, done: 3, skipped: 0 }, { total: 5, done: 4, skipped: 1 })
    ).toEqual({ total: 8, done: 7, skipped: 1, resolved: 8 })
  })

  it('ignora nulos', () => {
    expect(mergeTallies(null, { total: 2, done: 1, skipped: 0 }, undefined)).toEqual({
      total: 2,
      done: 1,
      skipped: 0,
      resolved: 1,
    })
  })
})

describe('dayStateFromTally — cierra con todo resuelto; ≥75% hecho es completo', () => {
  it('el umbral de completo es 75%', () => {
    expect(COMPLETE_THRESHOLD).toBe(0.75)
  })

  it('todo hecho → complete', () => {
    expect(dayStateFromTally({ total: 5, done: 5, skipped: 0 })).toBe('complete')
  })

  it('con omisiones pero 75% o más hecho → complete', () => {
    expect(dayStateFromTally({ total: 4, done: 3, skipped: 1 })).toBe('complete') // 75% justo
    expect(dayStateFromTally({ total: 5, done: 4, skipped: 1 })).toBe('complete') // 80%
    // El día de Franco del 28/9: activación 7 + Día A 5, omitió 2 de movilidad.
    expect(dayStateFromTally({ total: 12, done: 10, skipped: 2 })).toBe('complete')
  })

  it('menos del 75% hecho → partial, pero CIERRA (no importa cuántas omisiones)', () => {
    expect(dayStateFromTally({ total: 5, done: 3, skipped: 2 })).toBe('partial') // 60%
    expect(dayStateFromTally({ total: 12, done: 1, skipped: 11 })).toBe('partial')
    expect(isDayStateClosed(dayStateFromTally({ total: 5, done: 3, skipped: 2 }))).toBe(true)
  })

  it('algo sin resolver → open, con o sin omisiones', () => {
    expect(dayStateFromTally({ total: 5, done: 4, skipped: 0 })).toBe('open')
    expect(dayStateFromTally({ total: 5, done: 3, skipped: 1 })).toBe('open')
  })

  it('nada resuelto o sin ítems → none', () => {
    expect(dayStateFromTally({ total: 5, done: 0, skipped: 0 })).toBe('none')
    expect(dayStateFromTally({ total: 0, done: 0, skipped: 0 })).toBe('none')
    expect(dayStateFromTally(null)).toBe('none')
  })

  it('todo omitido NO cierra: "no hice nada" no es una sesión', () => {
    expect(dayStateFromTally({ total: 1, done: 0, skipped: 1 })).toBe('open')
    expect(dayStateFromTally({ total: 5, done: 0, skipped: 5 })).toBe('open')
  })
})

describe('isDayStateClosed', () => {
  it('complete y partial cierran; open y none no', () => {
    expect(isDayStateClosed('complete')).toBe(true)
    expect(isDayStateClosed('partial')).toBe(true)
    expect(isDayStateClosed('open')).toBe(false)
    expect(isDayStateClosed('none')).toBe(false)
    expect(isDayStateClosed(undefined)).toBe(false)
  })
})

describe('summarizeEntries / describeSkips (etapa 5)', () => {
  it('cuenta omisiones por motivo y la proporción tal cual / con ajustes', () => {
    const s = summarizeEntries([
      { completed: true, status: 'done', entry_mode: 'confirmed' },
      { completed: true, status: 'done', entry_mode: 'confirmed' },
      { completed: true, status: 'done', entry_mode: 'confirmed' },
      { completed: true, status: 'done', entry_mode: 'edited' },
      { completed: true, status: 'done', entry_mode: null }, // anterior a v54: no cuenta
      { completed: false, status: 'skipped', skip_reason: 'time' },
      { completed: false, status: 'skipped', skip_reason: 'time' },
      { completed: false, status: 'skipped', skip_reason: 'discomfort' },
    ])
    expect(s.skipped).toBe(3)
    expect(s.byReason).toEqual({
      choice: 0,
      time: 2,
      discomfort: 1,
      unclear: 0,
      other: 0,
      unknown: 0,
    })
    expect(s.withMode).toBe(4)
    expect(s.confirmedPct).toBe(75)
    expect(describeSkips(s)).toBe('3 omitidos: 2 por tiempo y 1 por molestia')
  })

  it('sin registros con modo, la proporción es null; sin omisiones, texto vacío', () => {
    const s = summarizeEntries([{ completed: true, status: 'done' }])
    expect(s.confirmedPct).toBeNull()
    expect(describeSkips(s)).toBe('')
    expect(describeSkips(summarizeEntries([{ status: 'skipped', skip_reason: 'choice' }]))).toBe(
      '1 omitido: 1 por elección'
    )
  })
})
