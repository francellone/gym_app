// ============================================================
// lastRoute.test.js — helpers de "recordar última pantalla" (opción A)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  KEY_PREFIX,
  SCHEMA_VERSION,
  DEFAULT_TTL_MS,
  buildKey,
  isRestorablePath,
  pathMatchesRole,
  wrapEnvelope,
  parseEnvelope,
  isExpired,
  saveLastRoute,
  readLastRoute,
  clearLastRoute,
  computeRestoreTarget,
} from './lastRoute'

// ── Storage en memoria (determinista) ──────────────────────────
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
      throw new Error('nope')
    },
  }
}

const USER = 'user-abc'

// ── buildKey ───────────────────────────────────────────────────
describe('buildKey', () => {
  it('arma la clave namespaceada con versión y userId', () => {
    expect(buildKey(USER)).toBe(`${KEY_PREFIX}:v${SCHEMA_VERSION}:${USER}`)
  })
  it('devuelve null sin userId', () => {
    expect(buildKey(null)).toBeNull()
    expect(buildKey(undefined)).toBeNull()
    expect(buildKey('')).toBeNull()
  })
})

// ── isRestorablePath ───────────────────────────────────────────
describe('isRestorablePath', () => {
  it('rechaza landings (inicio/login)', () => {
    expect(isRestorablePath('/')).toBe(false)
    expect(isRestorablePath('/login')).toBe(false)
    expect(isRestorablePath('/coach')).toBe(false)
    expect(isRestorablePath('/student')).toBe(false)
    expect(isRestorablePath('/coach/')).toBe(false) // trailing slash
  })
  it('acepta rutas profundas de ambos roles', () => {
    expect(isRestorablePath('/student/workout')).toBe(true)
    expect(isRestorablePath('/coach/students/123')).toBe(true)
    expect(isRestorablePath('/coach/plans/9/edit')).toBe(true)
  })
  it('ignora el querystring al comparar contra landings', () => {
    expect(isRestorablePath('/student/workout?day=B')).toBe(true)
    expect(isRestorablePath('/coach?tab=x')).toBe(false)
  })
  it('rechaza inputs inválidos', () => {
    expect(isRestorablePath('')).toBe(false)
    expect(isRestorablePath(null)).toBe(false)
    expect(isRestorablePath('relative/no-slash')).toBe(false)
  })
})

// ── pathMatchesRole ────────────────────────────────────────────
describe('pathMatchesRole', () => {
  it('empareja rutas de coach solo para coach', () => {
    expect(pathMatchesRole('/coach/students/1', 'coach')).toBe(true)
    expect(pathMatchesRole('/coach/students/1', 'student')).toBe(false)
  })
  it('empareja rutas de student solo para student', () => {
    expect(pathMatchesRole('/student/workout', 'student')).toBe(true)
    expect(pathMatchesRole('/student/workout', 'coach')).toBe(false)
  })
  it('no confunde prefijos ajenos', () => {
    expect(pathMatchesRole('/students/1', 'student')).toBe(false)
    expect(pathMatchesRole('/coaching', 'coach')).toBe(false)
  })
})

// ── envelope ───────────────────────────────────────────────────
describe('wrapEnvelope / parseEnvelope', () => {
  it('round-trip conserva path y savedAt', () => {
    const raw = wrapEnvelope('/coach/students/1', '2026-07-23T10:00:00.000Z')
    const env = parseEnvelope(raw)
    expect(env).toEqual({
      v: SCHEMA_VERSION,
      savedAt: '2026-07-23T10:00:00.000Z',
      path: '/coach/students/1',
    })
  })
  it('rechaza json corrupto o shape inválido', () => {
    expect(parseEnvelope('no-json')).toBeNull()
    expect(parseEnvelope('')).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: 999, savedAt: 'x', path: '/a' }))).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: SCHEMA_VERSION, path: '/a' }))).toBeNull()
    expect(parseEnvelope(JSON.stringify({ v: SCHEMA_VERSION, savedAt: 'x' }))).toBeNull()
  })
})

// ── isExpired ──────────────────────────────────────────────────
describe('isExpired', () => {
  const now = Date.parse('2026-07-23T18:00:00.000Z')
  it('no expira dentro del TTL', () => {
    const savedAt = '2026-07-23T15:00:00.000Z' // 3h antes
    expect(isExpired(savedAt, DEFAULT_TTL_MS, now)).toBe(false)
  })
  it('expira pasado el TTL', () => {
    const savedAt = '2026-07-23T06:00:00.000Z' // 12h antes
    expect(isExpired(savedAt, DEFAULT_TTL_MS, now)).toBe(true)
  })
  it('trata fechas inválidas como expiradas', () => {
    expect(isExpired('no-date', DEFAULT_TTL_MS, now)).toBe(true)
    expect(isExpired(null, DEFAULT_TTL_MS, now)).toBe(true)
  })
})

// ── save / read / clear ────────────────────────────────────────
describe('saveLastRoute / readLastRoute / clearLastRoute', () => {
  it('guarda y recupera una ruta profunda', () => {
    const storage = createMemoryStorage()
    const ok = saveLastRoute({ userId: USER, path: '/student/workout', storage })
    expect(ok).toBe(true)
    expect(readLastRoute({ userId: USER, storage })?.path).toBe('/student/workout')
  })
  it('NO guarda landings', () => {
    const storage = createMemoryStorage()
    expect(saveLastRoute({ userId: USER, path: '/coach', storage })).toBe(false)
    expect(saveLastRoute({ userId: USER, path: '/', storage })).toBe(false)
    expect(readLastRoute({ userId: USER, storage })).toBeNull()
  })
  it('clear borra la entrada', () => {
    const storage = createMemoryStorage()
    saveLastRoute({ userId: USER, path: '/student/workout', storage })
    expect(clearLastRoute({ userId: USER, storage })).toBe(true)
    expect(readLastRoute({ userId: USER, storage })).toBeNull()
  })
  it('degrada sin romper si el storage tira excepción (Safari privado)', () => {
    const storage = createThrowingStorage()
    expect(saveLastRoute({ userId: USER, path: '/student/workout', storage })).toBe(false)
    expect(readLastRoute({ userId: USER, storage })).toBeNull()
    expect(clearLastRoute({ userId: USER, storage })).toBe(false)
  })
  it('scopea por usuario (no cruza datos entre cuentas)', () => {
    const storage = createMemoryStorage()
    saveLastRoute({ userId: 'a', path: '/coach/students/1', storage })
    expect(readLastRoute({ userId: 'b', storage })).toBeNull()
  })
})

// ── computeRestoreTarget (la decisión) ─────────────────────────
describe('computeRestoreTarget', () => {
  const now = Date.parse('2026-07-23T18:00:00.000Z')
  const recent = '2026-07-23T17:00:00.000Z' // 1h antes → vigente
  const stale = '2026-07-23T06:00:00.000Z' // 12h antes → expirado

  function seed(path, savedAt, userId = USER) {
    const storage = createMemoryStorage()
    saveLastRoute({ userId, path, storage, savedAt })
    return storage
  }

  it('restaura la última pantalla cuando arrancamos en el inicio', () => {
    const storage = seed('/student/workout', recent)
    const target = computeRestoreTarget({
      currentPath: '/student',
      role: 'student',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBe('/student/workout')
  })

  it('NO pisa un deep-link (ya estamos en ruta profunda)', () => {
    const storage = seed('/student/workout', recent)
    const target = computeRestoreTarget({
      currentPath: '/student/progress', // ej. abrió una notificación
      role: 'student',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBeNull()
  })

  it('NO restaura si está expirado', () => {
    const storage = seed('/student/workout', stale)
    const target = computeRestoreTarget({
      currentPath: '/student',
      role: 'student',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBeNull()
  })

  it('NO restaura una ruta de otro rol (cambio de cuenta)', () => {
    const storage = seed('/coach/students/1', recent)
    const target = computeRestoreTarget({
      currentPath: '/student',
      role: 'student',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBeNull()
  })

  it('devuelve null si no hay nada guardado', () => {
    const storage = createMemoryStorage()
    const target = computeRestoreTarget({
      currentPath: '/coach',
      role: 'coach',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBeNull()
  })

  it('restaura también del lado coach', () => {
    const storage = seed('/coach/students/42', recent)
    const target = computeRestoreTarget({
      currentPath: '/coach',
      role: 'coach',
      userId: USER,
      storage,
      nowMs: now,
    })
    expect(target).toBe('/coach/students/42')
  })
})
