import { describe, it, expect } from 'vitest'
import {
  MAX_OMISSIONS_TO_CLOSE,
  isLogSkipped,
  isLogDone,
  isLogResolved,
  isTrainingActivity,
  tallyResolution,
  mergeTallies,
  dayStateFromTally,
  isDayStateClosed,
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

describe('dayStateFromTally — la regla de cierre por conteo de omisiones', () => {
  it('el umbral es una omisión', () => {
    expect(MAX_OMISSIONS_TO_CLOSE).toBe(1)
  })

  it('todo hecho → complete', () => {
    expect(dayStateFromTally({ total: 5, done: 5, skipped: 0 })).toBe('complete')
  })

  it('una omisión y el resto hecho → partial (cierra igual: "4 de 5")', () => {
    expect(dayStateFromTally({ total: 5, done: 4, skipped: 1 })).toBe('partial')
    // También en días chicos: 3 de 4 con una omisión cierra.
    expect(dayStateFromTally({ total: 4, done: 3, skipped: 1 })).toBe('partial')
  })

  it('dos o más omisiones → open, aunque todo esté resuelto', () => {
    expect(dayStateFromTally({ total: 5, done: 3, skipped: 2 })).toBe('open')
    expect(dayStateFromTally({ total: 5, done: 0, skipped: 5 })).toBe('open')
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

  it('el caso que motivó contar en vez de porcentaje: 4 de 5 cierra', () => {
    // Con "más del 80%" esto daba exactamente 80% y NO cerraba.
    expect(isDayStateClosed(dayStateFromTally({ total: 5, done: 4, skipped: 1 }))).toBe(true)
  })

  it('un día de un solo ítem omitido NO cierra: "no hice nada" no es una sesión', () => {
    // 1 omisión ≤ umbral y todo resuelto, pero cero hechos. Hay 13 días de
    // plan con una sola unidad en producción; sin esta guarda, omitirla
    // cerraba el día y sumaba a la adherencia semanal.
    expect(dayStateFromTally({ total: 1, done: 0, skipped: 1 })).toBe('open')
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
