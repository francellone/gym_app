import { describe, it, expect, beforeEach } from 'vitest'
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from './authSnapshot'

const user = { id: 'u1', email: 'a@b.com', foo: 'ignorado' }
const profile = { id: 'u1', role: 'student', language: 'es', name: 'Ana' }

beforeEach(() => {
  window.localStorage.clear()
})

describe('write + read round-trip', () => {
  it('guarda y devuelve user (slim) + profile', () => {
    expect(writeAuthSnapshot({ user, profile })).toBe(true)
    const read = readAuthSnapshot()
    expect(read.profile).toEqual(profile)
    // sólo id + email del user (no campos extra)
    expect(read.user).toEqual({ id: 'u1', email: 'a@b.com' })
  })

  it('devuelve null si no hay nada', () => {
    expect(readAuthSnapshot()).toBeNull()
  })
})

describe('validación', () => {
  it('write sin user/profile devuelve false y no guarda', () => {
    expect(writeAuthSnapshot({ user: null, profile })).toBe(false)
    expect(writeAuthSnapshot({ user, profile: null })).toBe(false)
    expect(readAuthSnapshot()).toBeNull()
  })

  it('email opcional: guarda null si falta', () => {
    writeAuthSnapshot({ user: { id: 'u2' }, profile })
    expect(readAuthSnapshot().user).toEqual({ id: 'u2', email: null })
  })

  it('read tolera JSON corrupto', () => {
    window.localStorage.setItem('gym_app:auth_snapshot:v1', '{no json')
    expect(readAuthSnapshot()).toBeNull()
  })
})

describe('TTL', () => {
  it('no devuelve snapshot más viejo que 30 días', () => {
    const t0 = 1_000_000_000_000
    writeAuthSnapshot({ user, profile, now: t0 })
    const day = 24 * 3600 * 1000
    expect(readAuthSnapshot({ now: t0 + 29 * day })).not.toBeNull()
    expect(readAuthSnapshot({ now: t0 + 31 * day })).toBeNull()
  })
})

describe('clearAuthSnapshot', () => {
  it('borra el snapshot', () => {
    writeAuthSnapshot({ user, profile })
    clearAuthSnapshot()
    expect(readAuthSnapshot()).toBeNull()
  })
})
