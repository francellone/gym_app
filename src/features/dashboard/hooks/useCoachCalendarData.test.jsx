// Elegir a una persona en el calendario no debe volver a traer lo global
// (2026-10-09: con la instancia lenta, era lo que más demoraba).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))

const { default: useCoachCalendarData, __clearCalendarGlobalCache } =
  await import('./useCoachCalendarData')

const calls = (table) => mock.from.mock.calls.filter(([t]) => t === table).length
const anchor = new Date(2026, 9, 9)

describe('useCoachCalendarData', () => {
  beforeEach(() => {
    mock.from.mockClear()
    __clearCalendarGlobalCache()
  })

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

  it('la agenda y el calendario del mes comparten una sola carga global', async () => {
    const today = new Date()
    const agenda = renderHook(() => useCoachCalendarData(today, [], { eventsOnly: true }))
    const month = renderHook(() => useCoachCalendarData(today, []))
    await waitFor(() => expect(agenda.result.current.loading).toBe(false))
    await waitFor(() => expect(month.result.current.loading).toBe(false))
    for (const t of ['profiles', 'payments', 'evaluation_results', 'student_milestones']) {
      expect(calls(t)).toBe(1)
    }
  })

  it('la ventana del mes actual cubre los próximos 7 días para la agenda', async () => {
    // 30/10: la grilla de octubre termina el domingo 2/11; la agenda necesita hasta el 5/11.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 30, 10))
    const { result } = renderHook(() => useCoachCalendarData(new Date(), [], { eventsOnly: true }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const lte = mock._chain.lte.mock.calls.map((c) => c[1])
    expect(lte).toContain('2026-11-05')
    vi.useRealTimers()
  })
})
