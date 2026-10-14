// Los filtros del inicio se aplican sobre lo ya cargado (2026-10-09): elegir
// persona, plan o período no vuelve a consultar la base.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))

const { default: CoachAdherenceList } = await import('./CoachAdherenceList')

const assignment = (id, studentId, name) => ({
  id,
  plan_id: `plan-${id}`,
  student_id: studentId,
  start_date: '2026-09-01',
  plan_type: 'training',
  status: 'active',
  plan: { title: `Plan ${name}`, plan_type: 'training' },
  student: { id: studentId, name, avatar_url: null, active: true },
})

describe('CoachAdherenceList', () => {
  it('filtra por persona sin volver a consultar', async () => {
    mock._chain.then.mockImplementationOnce((resolve) =>
      resolve({
        data: [assignment('a1', 's1', 'Ana Pérez'), assignment('a2', 's2', 'Bea Gómez')],
        error: null,
      })
    )
    const ui = (props) => (
      <MemoryRouter>
        <CoachAdherenceList {...props} />
      </MemoryRouter>
    )
    const { rerender } = render(ui({ filterStudentId: 's1' }))
    await waitFor(() => expect(screen.getAllByText(/Ana Pérez/).length).toBeGreaterThan(0))
    expect(screen.queryAllByText(/Bea Gómez/)).toHaveLength(0)
    const calls = mock.from.mock.calls.length

    rerender(
      ui({ filterStudentId: 's2', filterPeriodRange: { start: '2026-10-01', end: '2026-10-09' } })
    )
    await waitFor(() => expect(screen.getAllByText(/Bea Gómez/).length).toBeGreaterThan(0))
    expect(screen.queryAllByText(/Ana Pérez/)).toHaveLength(0)

    rerender(ui({ filterStudentId: 's1', filterPlanId: 'a1' }))
    await waitFor(() => expect(screen.getAllByText(/Ana Pérez/).length).toBeGreaterThan(0))

    expect(mock.from.mock.calls.length).toBe(calls)
  })
})
