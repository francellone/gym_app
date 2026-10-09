// Elegir a una persona en el calendario no debe volver a traer lo global
// (2026-10-09: con la instancia lenta, era lo que más demoraba).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))

const { default: useCoachCalendarData } = await import('./useCoachCalendarData')

const calls = (table) => mock.from.mock.calls.filter(([t]) => t === table).length
const anchor = new Date(2026, 9, 9)

describe('useCoachCalendarData', () => {
  beforeEach(() => mock.from.mockClear())

  it('al elegir una persona solo pide lo de esa persona', async () => {
    const { result, rerender } = renderHook(({ sel }) => useCoachCalendarData(anchor, sel), {
      initialProps: { sel: [] },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const globals = ['profiles', 'evaluation_results', 'payments', 'intake_form_assignments']
    const before = Object.fromEntries(globals.map((t) => [t, calls(t)]))
    expect(calls('workout_logs')).toBe(0)

    rerender({ sel: ['p1'] })
    await waitFor(() => expect(calls('workout_logs')).toBe(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    for (const t of globals) expect(calls(t)).toBe(before[t])
    expect(calls('workout_block_logs')).toBe(1)
  })

  it('volver a "todas" no dispara ninguna consulta', async () => {
    const { result, rerender } = renderHook(({ sel }) => useCoachCalendarData(anchor, sel), {
      initialProps: { sel: ['p1'] },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const n = mock.from.mock.calls.length
    rerender({ sel: [] })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mock.from.mock.calls.length).toBe(n)
  })
})
