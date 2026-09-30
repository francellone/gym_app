import { describe, it, expect, vi, beforeEach } from 'vitest'

let assignImpl = async () => ({})
const assignCalls = []
vi.mock('@/features/plans/assignmentHelpers', () => ({
  assignTemplateToStudent: (...a) => {
    assignCalls.push(a)
    return assignImpl(...a)
  },
}))

const { isSelfCoached, buildFreeLogArgs, startOwnPlan, ensureFreePlanExercise } =
  await import('./api')
const { filterTrainingLogs } = await import('@/features/plans/typeFilters')

describe('isSelfCoached', () => {
  it('sin coach o coach de sí misma → true; con coach → false', () => {
    expect(isSelfCoached({ id: 'a', coach_id: null })).toBe(true)
    expect(isSelfCoached({ id: 'a', coach_id: 'a' })).toBe(true)
    expect(isSelfCoached({ id: 'a', coach_id: 'c' })).toBe(false)
    expect(isSelfCoached(null)).toBe(false)
  })
})

describe('buildFreeLogArgs', () => {
  const base = {
    studentId: 's',
    planId: 'p',
    planExerciseId: 'pe',
    date: '2026-09-29',
    today: '2026-09-29',
  }
  it('descarta filas sin reps y convierte a número', () => {
    const args = buildFreeLogArgs({
      ...base,
      weightMode: 'with_weight',
      sets: [
        { reps: '10', weight: '20' },
        { reps: '', weight: '25' },
        { reps: '8', weight: '' },
      ],
    })
    expect(args.p_reps).toEqual([10, 8])
    expect(args.p_weights).toEqual([20, null])
    expect(args.p_actual_sets).toBe(2)
    expect(args.p_logged_late).toBe(false)
    expect(args.p_status).toBe('done')
  })
  it('peso corporal no manda kilos; otra fecha = cargado tarde', () => {
    const args = buildFreeLogArgs({
      ...base,
      date: '2026-09-28',
      weightMode: 'bodyweight',
      sets: [{ reps: '12', weight: '40' }],
      logId: 'l1',
    })
    expect(args.p_weights).toBeNull()
    expect(args.p_logged_late).toBe(true)
    expect(args.p_log_id).toBe('l1')
  })
})

describe('filterTrainingLogs (v68)', () => {
  it('el registro libre cuenta como entrenamiento; la evaluación no', () => {
    const rows = [
      { plan: { plan_type: 'free' } },
      { plan: { plan_type: 'training' } },
      { plan: { plan_type: 'evaluation' } },
    ]
    expect(filterTrainingLogs(rows)).toHaveLength(2)
  })
})

describe('ensureFreePlanExercise', () => {
  it('devuelve ids de la RPC', async () => {
    const sb = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: [{ plan_id: 'p', plan_exercise_id: 'pe' }], error: null }),
    }
    await expect(ensureFreePlanExercise(sb, 'ex')).resolves.toEqual({
      planId: 'p',
      planExerciseId: 'pe',
    })
    expect(sb.rpc).toHaveBeenCalledWith('free_plan_exercise', { p_exercise_id: 'ex' })
  })
})

// Mock mínimo de supabase: registra cada update y devuelve el assignment vigente.
function makeSupabase(current) {
  const updates = []
  const sb = {
    updates,
    from: vi.fn(() => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: current, error: null }),
        update: (payload) => {
          updates.push(payload)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
      return q
    }),
  }
  return sb
}

describe('startOwnPlan', () => {
  beforeEach(() => {
    assignCalls.length = 0
  })
  const now = new Date(2026, 8, 29)

  it('sin plan vigente: solo asigna', async () => {
    const sb = makeSupabase(null)
    assignImpl = async () => ({ assignment_id: 'new' })
    await startOwnPlan(sb, { templateId: 't', studentId: 's', now })
    expect(sb.updates).toEqual([])
    expect(assignCalls[0]).toEqual([
      sb,
      {
        templateId: 't',
        studentId: 's',
        startDate: '2026-09-29',
      },
    ])
  })

  it('con plan propio vigente: lo reemplaza y enlaza el sucesor', async () => {
    const sb = makeSupabase({ id: 'old', plan: { created_by: 's' } })
    assignImpl = async () => ({ assignment_id: 'new' })
    await startOwnPlan(sb, { templateId: 't', studentId: 's', now })
    expect(sb.updates).toEqual([
      { status: 'replaced', closed_at: '2026-09-29' },
      { replaced_by_assignment_id: 'new' },
    ])
  })

  it('si falla la asignación, reactiva el plan anterior', async () => {
    const sb = makeSupabase({ id: 'old', plan: { created_by: 's' } })
    assignImpl = async () => {
      throw new Error('boom')
    }
    let caught = null
    try {
      await startOwnPlan(sb, { templateId: 't', studentId: 's', now })
    } catch (err) {
      caught = err
    }
    expect(caught?.message).toBe('boom')
    expect(sb.updates.at(-1)).toEqual({ status: 'active', closed_at: null })
  })

  it('no toca un plan de coach vigente', async () => {
    const sb = makeSupabase({ id: 'old', plan: { created_by: 'coach' } })
    await expect(startOwnPlan(sb, { templateId: 't', studentId: 's', now })).rejects.toMatchObject({
      code: 'COACH_PLAN_ACTIVE',
    })
    expect(assignCalls).toHaveLength(0)
  })
})
