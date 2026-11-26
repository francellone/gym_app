import { describe, it, expect } from 'vitest'
import {
  DEACTIVATION_PAUSE_REASON as R,
  pickResumable,
  resumableTitles,
  pauseAssignmentsOnDeactivate,
  resumeAssignments,
} from './deactivation'

// Cliente falso encadenable que registra las llamadas (sin red ni base).
function fakeSupabase(result = { data: [], error: null }) {
  const calls = []
  const q = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then') return (res) => res(result)
        return (...args) => {
          calls.push([prop, ...args])
          return q
        }
      },
    }
  )
  return { client: { from: (t) => (calls.push(['from', t]), q) }, calls }
}

describe('pickResumable', () => {
  it('solo lo pausado por la desactivación, nunca lo pausado a mano', () => {
    const rows = [
      { id: 'a', status: 'paused', status_reason: R, plan_type: 'training' },
      { id: 'b', status: 'paused', status_reason: 'Inyeccion de hombro', plan_type: 'evaluation' },
    ]
    expect(pickResumable(rows).map((r) => r.id)).toEqual(['a'])
  })
  it('no reanuda si ya hay otra activa del mismo tipo', () => {
    const rows = [
      { id: 'a', status: 'paused', status_reason: R, plan_type: 'training' },
      { id: 'n', status: 'active', plan_type: 'training' },
      { id: 'e', status: 'paused', status_reason: R, plan_type: 'evaluation' },
    ]
    expect(pickResumable(rows).map((r) => r.id)).toEqual(['e'])
  })
  it('como mucho una por tipo', () => {
    const rows = [
      { id: 'a', status: 'paused', status_reason: R, plan_type: 'training' },
      { id: 'b', status: 'paused', status_reason: R, plan_type: 'training' },
    ]
    expect(pickResumable(rows)).toHaveLength(1)
  })
})

describe('resumableTitles', () => {
  it('saca el sufijo con el nombre de la persona', () => {
    expect(resumableTitles([{ plan: { title: 'Plan 2 — Ari' } }, { plan: null }])).toBe('Plan 2')
  })
})

describe('llamadas a la base', () => {
  it('pausar filtra por persona y status active, con el motivo fijo', async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: 'x' }], error: null })
    const out = await pauseAssignmentsOnDeactivate(client, 's1')
    expect(out).toEqual([{ id: 'x' }])
    expect(calls).toContainEqual(['update', { status: 'paused', status_reason: R }])
    expect(calls).toContainEqual(['eq', 'student_id', 's1'])
    expect(calls).toContainEqual(['eq', 'status', 'active'])
  })
  it('reanudar sin ids no toca la base', async () => {
    const { client, calls } = fakeSupabase()
    await resumeAssignments(client, [])
    expect(calls).toHaveLength(0)
  })
  it('propaga el error', async () => {
    const { client } = fakeSupabase({ data: null, error: new Error('rls') })
    await expect(pauseAssignmentsOnDeactivate(client, 's1')).rejects.toThrow('rls')
  })
})
