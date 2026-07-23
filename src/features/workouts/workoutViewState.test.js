// ============================================================
// workoutViewState.test.js — bloque desplegado + scroll (opción B UI)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  EXP_KEY_PREFIX,
  SCROLL_KEY_PREFIX,
  SCHEMA_VERSION,
  DEFAULT_TTL_MS,
  buildExpKey,
  buildScrollKey,
  isExpired,
  writeExpanded,
  readExpanded,
  writeScroll,
  readScroll,
} from './workoutViewState'

function mem(initial = {}) {
  const data = { ...initial }
  return {
    get length() { return Object.keys(data).length },
    key(i) { return Object.keys(data)[i] ?? null },
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null },
    setItem(k, v) { data[k] = String(v) },
    removeItem(k) { delete data[k] },
  }
}
function throwing() {
  return {
    length: 0, key() { return null },
    getItem() { throw new Error('private') },
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('x') },
  }
}

const DATE = '2026-07-23'
const now = Date.parse('2026-07-23T18:00:00.000Z')
const recent = '2026-07-23T17:00:00.000Z'
const stale = '2026-07-22T20:00:00.000Z'

describe('claves', () => {
  it('buildExpKey / buildScrollKey', () => {
    expect(buildExpKey('b1')).toBe(`${EXP_KEY_PREFIX}:v${SCHEMA_VERSION}:b1`)
    expect(buildScrollKey('s1')).toBe(`${SCROLL_KEY_PREFIX}:v${SCHEMA_VERSION}:s1`)
    expect(buildExpKey(null)).toBeNull()
    expect(buildScrollKey('')).toBeNull()
  })
  it('buildExpKey acepta blockId numérico 0', () => {
    expect(buildExpKey(0)).toBe(`${EXP_KEY_PREFIX}:v${SCHEMA_VERSION}:0`)
  })
})

describe('isExpired', () => {
  it('dentro/fuera del TTL', () => {
    expect(isExpired(recent, DEFAULT_TTL_MS, now)).toBe(false)
    expect(isExpired(stale, DEFAULT_TTL_MS, now)).toBe(true)
    expect(isExpired('nope', DEFAULT_TTL_MS, now)).toBe(true)
  })
})

describe('bloque desplegado', () => {
  it('guarda y restaura expanded del mismo día', () => {
    const s = mem()
    expect(writeExpanded({ blockId: 'b1', loggedDate: DATE, expanded: true, storage: s, savedAt: recent })).toBe(true)
    expect(readExpanded({ blockId: 'b1', loggedDate: DATE, storage: s, nowMs: now })).toBe(true)
  })
  it('expanded=false se restaura como false', () => {
    const s = mem()
    writeExpanded({ blockId: 'b1', loggedDate: DATE, expanded: false, storage: s, savedAt: recent })
    expect(readExpanded({ blockId: 'b1', loggedDate: DATE, storage: s, nowMs: now })).toBe(false)
  })
  it('NO restaura si es de otro día', () => {
    const s = mem()
    writeExpanded({ blockId: 'b1', loggedDate: '2026-07-22', expanded: true, storage: s, savedAt: recent })
    expect(readExpanded({ blockId: 'b1', loggedDate: DATE, storage: s, nowMs: now })).toBe(false)
  })
  it('NO restaura si expiró', () => {
    const s = mem()
    writeExpanded({ blockId: 'b1', loggedDate: DATE, expanded: true, storage: s, savedAt: stale })
    expect(readExpanded({ blockId: 'b1', loggedDate: DATE, storage: s, nowMs: now })).toBe(false)
  })
  it('no persiste sin blockId o sin loggedDate', () => {
    const s = mem()
    expect(writeExpanded({ blockId: null, loggedDate: DATE, expanded: true, storage: s })).toBe(false)
    expect(writeExpanded({ blockId: 'b1', loggedDate: null, expanded: true, storage: s })).toBe(false)
  })
  it('degrada si el storage tira (Safari privado)', () => {
    const s = throwing()
    expect(writeExpanded({ blockId: 'b1', loggedDate: DATE, expanded: true, storage: s })).toBe(false)
    expect(readExpanded({ blockId: 'b1', loggedDate: DATE, storage: s, nowMs: now })).toBe(false)
  })
  it('bloques distintos no se pisan', () => {
    const s = mem()
    writeExpanded({ blockId: 'b1', loggedDate: DATE, expanded: true, storage: s, savedAt: recent })
    expect(readExpanded({ blockId: 'b2', loggedDate: DATE, storage: s, nowMs: now })).toBe(false)
  })
})

describe('scroll', () => {
  it('guarda y restaura Y del mismo día', () => {
    const s = mem()
    expect(writeScroll({ studentId: 's1', loggedDate: DATE, y: 850, storage: s, savedAt: recent })).toBe(true)
    expect(readScroll({ studentId: 's1', loggedDate: DATE, storage: s, nowMs: now })).toBe(850)
  })
  it('redondea y no admite negativos', () => {
    const s = mem()
    writeScroll({ studentId: 's1', loggedDate: DATE, y: -20.7, storage: s, savedAt: recent })
    expect(readScroll({ studentId: 's1', loggedDate: DATE, storage: s, nowMs: now })).toBe(0)
  })
  it('NO restaura si es de otro día', () => {
    const s = mem()
    writeScroll({ studentId: 's1', loggedDate: '2026-07-22', y: 500, storage: s, savedAt: recent })
    expect(readScroll({ studentId: 's1', loggedDate: DATE, storage: s, nowMs: now })).toBeNull()
  })
  it('NO restaura si expiró', () => {
    const s = mem()
    writeScroll({ studentId: 's1', loggedDate: DATE, y: 500, storage: s, savedAt: stale })
    expect(readScroll({ studentId: 's1', loggedDate: DATE, storage: s, nowMs: now })).toBeNull()
  })
  it('no persiste sin y numérico', () => {
    const s = mem()
    expect(writeScroll({ studentId: 's1', loggedDate: DATE, y: NaN, storage: s })).toBe(false)
    expect(writeScroll({ studentId: 's1', loggedDate: DATE, y: 'x', storage: s })).toBe(false)
  })
  it('scopea por alumno', () => {
    const s = mem()
    writeScroll({ studentId: 'a', loggedDate: DATE, y: 300, storage: s, savedAt: recent })
    expect(readScroll({ studentId: 'b', loggedDate: DATE, storage: s, nowMs: now })).toBeNull()
  })
  it('null si no hay nada', () => {
    expect(readScroll({ studentId: 's1', loggedDate: DATE, storage: mem(), nowMs: now })).toBeNull()
  })
})
