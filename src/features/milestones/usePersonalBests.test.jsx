import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const api = vi.hoisted(() => ({
  awardMilestone: vi.fn(),
  countBestsSince: vi.fn(),
  fetchBestForLog: vi.fn(),
  fetchExerciseHistory: vi.fn(),
  fetchVoidedBestLogIds: vi.fn(),
  voidPersonalBest: vi.fn(),
}))
vi.mock('./api', () => api)
const ctx = vi.hoisted(() => ({ value: { enabled: true, celebrate: vi.fn(), setHold: vi.fn() } }))
vi.mock('./celebrationContextValue', () => ({ useCelebrations: () => ctx.value }))

const { usePersonalBests } = await import('./usePersonalBests')

const wlog = (id, w) => ({
  id,
  completed: true,
  status: 'done',
  actual_weights_jsonb: [w],
  actual_reps_jsonb: [10],
})
const HISTORY = [wlog('h1', 20), wlog('h2', 22.5), wlog('h3', 25)]
const planEx = { id: 'pe1', exercise_id: 'ex1' }
const newLog = (w) => ({ ...wlog('new', w), logged_date: '2026-09-25' })

async function run(log) {
  const { result } = renderHook(() => usePersonalBests({ studentId: 's1' }))
  await act(async () => {
    await result.current.checkBest({ log, planEx, exerciseName: 'Sentadilla' })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.value = { enabled: true, celebrate: vi.fn(), setHold: vi.fn() }
  api.fetchExerciseHistory.mockResolvedValue(HISTORY)
  api.fetchVoidedBestLogIds.mockResolvedValue([])
  api.fetchBestForLog.mockResolvedValue(null)
  api.countBestsSince.mockResolvedValue(0)
  api.awardMilestone.mockImplementation(async (_s, _sid, c) => ({
    id: 'm1',
    kind: c.kind,
    period_key: c.periodKey,
    payload: c.payload,
    isNew: true,
  }))
})

describe('usePersonalBests', () => {
  it('marca nueva: la otorga con nombre y ejercicio del plan, y la muestra', async () => {
    await run(newLog(27.5))
    expect(api.awardMilestone).toHaveBeenCalledTimes(1)
    const cand = api.awardMilestone.mock.calls[0][2]
    expect(cand).toMatchObject({ kind: 'personal_best', workoutLogId: 'new' })
    expect(cand.payload).toMatchObject({
      value: 27.5,
      previous_max: 25,
      exercise_name: 'Sentadilla',
      plan_exercise_id: 'pe1',
    })
    expect(ctx.value.celebrate).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'best', id: 'm1' })
    )
  })

  it('segunda marca del día: se otorga en silencio', async () => {
    api.countBestsSince.mockResolvedValue(1)
    await run(newLog(27.5))
    expect(api.awardMilestone).toHaveBeenCalled()
    expect(ctx.value.celebrate).not.toHaveBeenCalled()
  })

  it('no es marca: no otorga nada', async () => {
    await run(newLog(25))
    expect(api.awardMilestone).not.toHaveBeenCalled()
  })

  it('corrigió un registro que era marca y ya no lo es: se anula sola', async () => {
    api.fetchBestForLog.mockResolvedValue({ id: 'm-old', voided_at: null })
    await run(newLog(24))
    expect(api.voidPersonalBest).toHaveBeenCalledWith({}, 'm-old', 'corrected')
    expect(api.awardMilestone).not.toHaveBeenCalled()
  })

  it('sigue siendo marca después de editar: no toca nada', async () => {
    api.fetchBestForLog.mockResolvedValue({ id: 'm-old', voided_at: null })
    await run(newLog(30))
    expect(api.voidPersonalBest).not.toHaveBeenCalled()
    expect(api.awardMilestone).not.toHaveBeenCalled()
  })

  it('modo coach (sin celebraciones): otorga pero no muestra', async () => {
    ctx.value = { enabled: false, celebrate: vi.fn(), setHold: vi.fn() }
    await run(newLog(27.5))
    expect(api.awardMilestone).toHaveBeenCalled()
    expect(ctx.value.celebrate).not.toHaveBeenCalled()
  })

  it('un error de red no rompe el guardado', async () => {
    api.fetchExerciseHistory.mockRejectedValue(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await run(newLog(27.5))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
