import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const api = vi.hoisted(() => ({ fetchPersonalBests: vi.fn(), voidPersonalBest: vi.fn() }))
vi.mock('../api', () => api)
const { default: PersonalBestsCard } = await import('./PersonalBestsCard')

const ROWS = [
  {
    id: 'b1',
    created_at: '2026-09-25T12:00:00Z',
    payload: { metric: 'weight', value: 42.5, previous_max: 40 },
    voided_at: null,
    exercise: { name: 'Sentadilla' },
  },
  {
    id: 'b2',
    created_at: '2026-09-20T12:00:00Z',
    payload: { metric: 'reps', value: 12, previous_max: 10 },
    voided_at: '2026-09-21',
    void_reason: 'student_void',
    exercise: { name: 'Dominadas' },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchPersonalBests.mockResolvedValue(ROWS)
  api.voidPersonalBest.mockResolvedValue({ voided: true })
})

describe('PersonalBestsCard', () => {
  it('lista vigentes y anuladas', async () => {
    render(<PersonalBestsCard studentId="s1" />)
    expect(await screen.findByText('Sentadilla')).toBeInTheDocument()
    expect(screen.getByText(/42,5 kg · antes 40 kg/)).toBeInTheDocument()
    expect(screen.getByText(/Anulada · la anuló la persona/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Anular' })).toHaveLength(1)
  })

  it('anular pide confirmación y llama a la RPC como coach', async () => {
    render(<PersonalBestsCard studentId="s1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Anular' }))
    expect(screen.getByText(/deja de contar como referencia/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Anular marca' }))
    await waitFor(() => expect(api.voidPersonalBest).toHaveBeenCalledWith({}, 'b1', 'coach_void'))
    expect(api.fetchPersonalBests).toHaveBeenCalledTimes(2)
  })

  it('sin marcas no muestra nada', async () => {
    api.fetchPersonalBests.mockResolvedValue([])
    const { container } = render(<PersonalBestsCard studentId="s1" />)
    await waitFor(() => expect(api.fetchPersonalBests).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
