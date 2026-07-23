// ============================================================
// activeDayStorage.test.js — persistencia del día activo (opción B)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  KEY_PREFIX,
  SCHEMA_VERSION,
  DEFAULT_TTL_MS,
  buildKey,
  wrapEnvelope,
  parseEnvelope,
  isExpired,
  saveActiveDay,
  readActiveDay,
  clearActiveDay,
  resolveActiveDay,
} from './activeDayStorage'

function createMemoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    get length() {
      return Object.keys(data).length
    },
    key(i) {
      return Object.keys(data)[i] ?? null
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null
    },
    setItem(k, v) {
      data[k] = String(v)
    },
    removeItem(k) {
      delete data[k]
    },
  }
}

function createThrowingStorage() {
  return {
    length: 0,
    key() {
      return null
    },
    getItem() {
      throw new Error('Safari private mode')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
    removeItem() {
      throw new Error('nope')
    },
  }
}

const STU = 'stu-1'
const DATE = '2026-07-23'
const DAYS = ['day_a', 'day_b', 'day_c']

describe('buildKey', () => {
  it('arma la clave con versión y studentId', () => {
    expect(buildKey(STU)).toBe(`${KEY_PREFIX}:v${SCHEMA_VERSION}:${STU}`)
  })
  it('null sin studentId', () => {
    expect(buildKey(null)).toBeNull()
    expect(buildKey('')).toBeNull()
  })
})

describe('wrapEnvelope / parseEnvelope', () => {
  it('round-trip conserva dayId y loggedDate', () => {
    const raw = wrapEnvelope({ dayId: 'day_b', loggedDate: DATE, savedAt: '2026-07-23T10:00:00.000Z' })
    expect(parseEnvelope(raw)).toEqual({
      v: SCHEMA_VERSION,
      savedAt: '2026-07-23T10:00:00.000Z',
      dayId: 'day_b',
      loggedDate: DATE,
    })
  })
  it('rechaza shapes inválidos', () => {
    expect(parseEnvelope('nope')).toBeNull()
    expect(parseEnvelope('')).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: 999, savedAt: 'x', dayId: 'd', loggedDate: DATE }))).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: SCHEMA_VERSION, savedAt: 'x', loggedDate: DATE }))).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: SCHEMA_VERSION, savedAt: 'x', dayId: 'd' }))).toBeNull()
  })
})

describe('isExpired', () => {
  const now = Date.parse('2026-07-23T18:00:00.000Z')
  it('no expira dentro del TTL', () => {
    expect(isExpired('2026-07-23T10:00:00.000Z', DEFAULT_TTL_MS, now)).toBe(false)
  })
  it('expira pasado el TTL', () => {
    expect(isExpired('2026-07-22T20:00:00.000Z', DEFAULT_TTL_MS, now)).toBe(true)
  })
  it('fecha inválida = expirada', () => {
    expect(isExpired('nope', DEFAULT_TTL_MS, now)).toBe(true)
  })
})

describe('save / read / clear', () => {
  it('guarda y recupera', () => {
    const storage = createMemoryStorage()
    expect(saveActiveDay({ studentId: STU, dayId: 'day_b', loggedDate: DATE, storage })).toBe(true)
    expect(readActiveDay({ studentId: STU, storage })?.dayId).toBe('day_b')
  })
  it('no guarda sin dayId o sin loggedDate', () => {
    const storage = createMemoryStorage()
    expect(saveActiveDay({ studentId: STU, dayId: '', loggedDate: DATE, storage })).toBe(false)
    expect(saveActiveDay({ studentId: STU, dayId: 'day_b', loggedDate: '', storage })).toBe(false)
  })
  it('clear borra', () => {
    const storage = createMemoryStorage()
    saveActiveDay({ studentId: STU, dayId: 'day_b', loggedDate: DATE, storage })
    expect(clearActiveDay({ studentId: STU, storage })).toBe(true)
    expect(readActiveDay({ studentId: STU, storage })).toBeNull()
  })
  it('degrada si el storage tira (Safari privado)', () => {
    const storage = createThrowingStorage()
    expect(saveActiveDay({ studentId: STU, dayId: 'day_b', loggedDate: DATE, storage })).toBe(false)
    expect(readActiveDay({ studentId: STU, storage })).toBeNull()
  })
  it('scopea por alumno', () => {
    const storage = createMemoryStorage()
    saveActiveDay({ studentId: 'a', dayId: 'day_b', loggedDate: DATE, storage })
    expect(readActiveDay({ studentId: 'b', storage })).toBeNull()
  })
})

describe('resolveActiveDay', () => {
  const now = Date.parse('2026-07-23T18:00:00.000Z')
  const recent = '2026-07-23T17:00:00.000Z'
  const old = '2026-07-22T20:00:00.000Z'

  function seed({ dayId, loggedDate, savedAt }) {
    const storage = createMemoryStorage()
    saveActiveDay({ studentId: STU, dayId, loggedDate, storage, savedAt })
    return storage
  }

  it('restaura el día guardado del mismo día', () => {
    const storage = seed({ dayId: 'day_b', loggedDate: DATE, savedAt: recent })
    expect(
      resolveActiveDay({ studentId: STU, loggedDate: DATE, availableDays: DAYS, storage, nowMs: now })
    ).toBe('day_b')
  })

  it('NO restaura si es de otro día (volvés al día siguiente)', () => {
    const storage = seed({ dayId: 'day_b', loggedDate: '2026-07-22', savedAt: recent })
    expect(
      resolveActiveDay({ studentId: STU, loggedDate: DATE, availableDays: DAYS, storage, nowMs: now })
    ).toBeNull()
  })

  it('NO restaura si expiró (backstop de TTL)', () => {
    const storage = seed({ dayId: 'day_b', loggedDate: DATE, savedAt: old })
    expect(
      resolveActiveDay({ studentId: STU, loggedDate: DATE, availableDays: DAYS, storage, nowMs: now })
    ).toBeNull()
  })

  it('NO restaura un día que ya no existe en el plan', () => {
    const storage = seed({ dayId: 'day_z', loggedDate: DATE, savedAt: recent })
    expect(
      resolveActiveDay({ studentId: STU, loggedDate: DATE, availableDays: DAYS, storage, nowMs: now })
    ).toBeNull()
  })

  it('null si no hay nada guardado', () => {
    const storage = createMemoryStorage()
    expect(
      resolveActiveDay({ studentId: STU, loggedDate: DATE, availableDays: DAYS, storage, nowMs: now })
    ).toBeNull()
  })
})
