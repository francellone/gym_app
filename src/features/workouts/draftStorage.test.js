// ============================================================
// draftStorage.test.js — F4 helpers de drafts locales
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest'
import {
  KEY_PREFIX,
  SCHEMA_VERSION,
  DEFAULT_TTL_MS,
  buildDraftKey,
  parseDraftKey,
  wrapDraftEnvelope,
  parseDraftEnvelope,
  isDraftExpired,
  readDraft,
  writeDraft,
  removeDraft,
  cleanupStaleDrafts,
} from './draftStorage'

// ── Mock de storage en memoria ─────────────────────────────────
// jsdom incluye localStorage real, pero usar mock manual nos da
// control fino para tests determinísticos + simular fallas.
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
    clear() {
      Object.keys(data).forEach((k) => delete data[k])
    },
    _dump() {
      return { ...data }
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
      throw new Error('blocked')
    },
    clear() {
      throw new Error('blocked')
    },
  }
}

describe('buildDraftKey', () => {
  it('arma la key con la convención esperada', () => {
    const k = buildDraftKey({
      studentId: 'stu-1',
      planExerciseId: 'pe-1',
      loggedDate: '2026-05-24',
    })
    expect(k).toBe(`${KEY_PREFIX}:v${SCHEMA_VERSION}:stu-1:pe-1:2026-05-24`)
  })

  it('devuelve null si falta algún componente', () => {
    expect(buildDraftKey({ studentId: '', planExerciseId: 'pe-1', loggedDate: '2026-05-24' })).toBeNull()
    expect(buildDraftKey({ studentId: 's', planExerciseId: null, loggedDate: '2026-05-24' })).toBeNull()
    expect(buildDraftKey({ studentId: 's', planExerciseId: 'pe', loggedDate: undefined })).toBeNull()
  })
})

describe('parseDraftKey', () => {
  it('parsea correctamente keys válidas y extrae version + ids + date', () => {
    const k = `${KEY_PREFIX}:v1:stu-1:pe-1:2026-05-24`
    expect(parseDraftKey(k)).toEqual({
      version: 1,
      studentId: 'stu-1',
      planExerciseId: 'pe-1',
      loggedDate: '2026-05-24',
    })
  })

  it('devuelve null para keys con shape inesperado', () => {
    expect(parseDraftKey('foo')).toBeNull()
    expect(parseDraftKey(`${KEY_PREFIX}:v1:incompleto`)).toBeNull()
    expect(parseDraftKey(`${KEY_PREFIX}:noversion:stu:pe:date`)).toBeNull()
    expect(parseDraftKey(`${KEY_PREFIX}:vX:stu:pe:date`)).toBeNull()
    expect(parseDraftKey('')).toBeNull()
    expect(parseDraftKey(null)).toBeNull()
  })

  it('buildDraftKey y parseDraftKey son inversos', () => {
    const args = {
      studentId: 'aaa-bbb-ccc',
      planExerciseId: 'plan-ex-9',
      loggedDate: '2026-12-31',
    }
    const parsed = parseDraftKey(buildDraftKey(args))
    expect(parsed).toEqual({ version: SCHEMA_VERSION, ...args })
  })
})

describe('wrapDraftEnvelope / parseDraftEnvelope', () => {
  it('round-trip mantiene el payload intacto', () => {
    const payload = {
      actual_sets: '3',
      actual_reps_arr: ['10', '8', ''],
      actual_weights_arr: ['22.5', '22.5', ''],
      notes: 'se sintió liviano',
      perceived_difficulty: null,
      weight_mode: 'with_weight',
      unilateral: false,
      reps_unit: null,
    }
    const raw = wrapDraftEnvelope(payload, '2026-05-24T13:42:11.000Z')
    const env = parseDraftEnvelope(raw)
    expect(env).toEqual({
      v: SCHEMA_VERSION,
      savedAt: '2026-05-24T13:42:11.000Z',
      payload,
    })
  })

  it('parseDraftEnvelope rechaza JSON inválido', () => {
    expect(parseDraftEnvelope('not-json')).toBeNull()
    expect(parseDraftEnvelope('')).toBeNull()
    expect(parseDraftEnvelope(null)).toBeNull()
  })

  it('parseDraftEnvelope rechaza envelope con versión distinta', () => {
    const raw = JSON.stringify({ v: 99, savedAt: '2026-05-24T00:00:00Z', payload: {} })
    expect(parseDraftEnvelope(raw)).toBeNull()
  })

  it('parseDraftEnvelope rechaza envelope sin savedAt o sin payload', () => {
    expect(
      parseDraftEnvelope(JSON.stringify({ v: SCHEMA_VERSION, payload: {} }))
    ).toBeNull()
    expect(
      parseDraftEnvelope(JSON.stringify({ v: SCHEMA_VERSION, savedAt: '2026-05-24T00:00:00Z' }))
    ).toBeNull()
    expect(
      parseDraftEnvelope(JSON.stringify({ v: SCHEMA_VERSION, savedAt: '2026-05-24T00:00:00Z', payload: null }))
    ).toBeNull()
  })
})

describe('isDraftExpired', () => {
  const now = Date.parse('2026-05-24T12:00:00Z')

  it('false si savedAt está dentro del TTL', () => {
    const savedAt = new Date(now - 1 * 60 * 60 * 1000).toISOString() // 1h atrás
    expect(isDraftExpired(savedAt, DEFAULT_TTL_MS, now)).toBe(false)
  })

  it('true si savedAt está fuera del TTL', () => {
    const savedAt = new Date(now - 9 * 60 * 60 * 1000).toISOString() // 9h atrás
    expect(isDraftExpired(savedAt, DEFAULT_TTL_MS, now)).toBe(true)
  })

  it('true en el borde exacto', () => {
    const savedAt = new Date(now - DEFAULT_TTL_MS).toISOString()
    expect(isDraftExpired(savedAt, DEFAULT_TTL_MS, now)).toBe(true)
  })

  it('true si savedAt no es una fecha válida', () => {
    expect(isDraftExpired('not-a-date', DEFAULT_TTL_MS, now)).toBe(true)
    expect(isDraftExpired(null, DEFAULT_TTL_MS, now)).toBe(true)
    expect(isDraftExpired(undefined, DEFAULT_TTL_MS, now)).toBe(true)
  })
})

describe('readDraft / writeDraft / removeDraft', () => {
  let storage
  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('write y read round-trip', () => {
    const key = buildDraftKey({ studentId: 's', planExerciseId: 'p', loggedDate: '2026-05-24' })
    const payload = { actual_sets: '3', notes: 'x' }
    const ok = writeDraft(key, payload, storage, '2026-05-24T10:00:00.000Z')
    expect(ok).toBe(true)

    const env = readDraft(key, storage)
    expect(env).toEqual({
      v: SCHEMA_VERSION,
      savedAt: '2026-05-24T10:00:00.000Z',
      payload,
    })
  })

  it('readDraft devuelve null si la key no existe', () => {
    expect(readDraft('nope', storage)).toBeNull()
  })

  it('removeDraft borra la key', () => {
    const key = buildDraftKey({ studentId: 's', planExerciseId: 'p', loggedDate: '2026-05-24' })
    writeDraft(key, { x: 1 }, storage)
    expect(readDraft(key, storage)).not.toBeNull()
    removeDraft(key, storage)
    expect(readDraft(key, storage)).toBeNull()
  })

  it('no rompe si storage lanza (Safari privado / cuota llena)', () => {
    const throwing = createThrowingStorage()
    expect(readDraft('k', throwing)).toBeNull()
    expect(writeDraft('k', { x: 1 }, throwing)).toBe(false)
    expect(removeDraft('k', throwing)).toBe(false)
  })

  it('devuelve null/false si no hay storage disponible', () => {
    expect(readDraft('k', null)).toBeNull()
    expect(writeDraft('k', { x: 1 }, null)).toBe(false)
    expect(removeDraft('k', null)).toBe(false)
  })
})

describe('cleanupStaleDrafts', () => {
  const now = Date.parse('2026-05-24T12:00:00Z')

  function seed(storage, entries) {
    for (const [k, env] of entries) {
      storage.setItem(k, typeof env === 'string' ? env : JSON.stringify(env))
    }
  }

  it('borra drafts con loggedDate más viejo que maxAgeDays', () => {
    const storage = createMemoryStorage()
    const recentKey = buildDraftKey({ studentId: 's', planExerciseId: 'p1', loggedDate: '2026-05-24' })
    const oldKey = buildDraftKey({ studentId: 's', planExerciseId: 'p2', loggedDate: '2026-05-10' })
    seed(storage, [
      [recentKey, { v: SCHEMA_VERSION, savedAt: '2026-05-24T11:00:00Z', payload: { a: 1 } }],
      [oldKey, { v: SCHEMA_VERSION, savedAt: '2026-05-10T11:00:00Z', payload: { a: 1 } }],
    ])

    const removed = cleanupStaleDrafts({ studentId: 's', now, storage, maxAgeDays: 7 })
    expect(removed).toBe(1)
    expect(storage.getItem(recentKey)).not.toBeNull()
    expect(storage.getItem(oldKey)).toBeNull()
  })

  it('borra drafts de otro studentId (cambio de cuenta en mismo browser)', () => {
    const storage = createMemoryStorage()
    const mine = buildDraftKey({ studentId: 'me', planExerciseId: 'p1', loggedDate: '2026-05-24' })
    const other = buildDraftKey({ studentId: 'other', planExerciseId: 'p2', loggedDate: '2026-05-24' })
    seed(storage, [
      [mine, { v: SCHEMA_VERSION, savedAt: '2026-05-24T11:00:00Z', payload: {} }],
      [other, { v: SCHEMA_VERSION, savedAt: '2026-05-24T11:00:00Z', payload: {} }],
    ])

    cleanupStaleDrafts({ studentId: 'me', now, storage })
    expect(storage.getItem(mine)).not.toBeNull()
    expect(storage.getItem(other)).toBeNull()
  })

  it('borra envelopes con versión vieja (migración hacia delante)', () => {
    const storage = createMemoryStorage()
    const k = buildDraftKey({ studentId: 's', planExerciseId: 'p', loggedDate: '2026-05-24' })
    seed(storage, [[k, { v: SCHEMA_VERSION + 1, savedAt: '2026-05-24T11:00:00Z', payload: {} }]])
    cleanupStaleDrafts({ studentId: 's', now, storage })
    // El cleanup borra la key porque el envelope no parsea como v actual
    expect(storage.getItem(k)).toBeNull()
  })

  it('borra envelopes con TTL expirado aunque la fecha sea reciente', () => {
    const storage = createMemoryStorage()
    const k = buildDraftKey({ studentId: 's', planExerciseId: 'p', loggedDate: '2026-05-24' })
    // savedAt de hace 10h, fecha del día actual → fecha OK pero TTL expirado
    const savedAt = new Date(now - 10 * 60 * 60 * 1000).toISOString()
    seed(storage, [[k, { v: SCHEMA_VERSION, savedAt, payload: {} }]])
    cleanupStaleDrafts({ studentId: 's', now, storage, ttlMs: DEFAULT_TTL_MS })
    expect(storage.getItem(k)).toBeNull()
  })

  it('preserva keys que no son nuestras (otros features del localStorage)', () => {
    const storage = createMemoryStorage()
    storage.setItem('other_feature:key', 'value')
    storage.setItem('redux-persist:root', 'value')
    cleanupStaleDrafts({ studentId: 's', now, storage })
    expect(storage.getItem('other_feature:key')).toBe('value')
    expect(storage.getItem('redux-persist:root')).toBe('value')
  })

  it('no rompe si storage lanza al iterar', () => {
    const throwing = createThrowingStorage()
    // Object.defineProperty length para forzar acceso a iter
    Object.defineProperty(throwing, 'length', {
      get() {
        throw new Error('blocked')
      },
    })
    expect(cleanupStaleDrafts({ studentId: 's', now, storage: throwing })).toBe(0)
  })

  it('devuelve 0 sin tocar nada si no hay storage disponible', () => {
    expect(cleanupStaleDrafts({ studentId: 's', now, storage: null })).toBe(0)
  })

  it('borra entries cuyo envelope no parsea (JSON corrupto)', () => {
    const storage = createMemoryStorage()
    const k = buildDraftKey({ studentId: 's', planExerciseId: 'p', loggedDate: '2026-05-24' })
    storage.setItem(k, 'NOT-JSON')
    cleanupStaleDrafts({ studentId: 's', now, storage })
    expect(storage.getItem(k)).toBeNull()
  })
})
