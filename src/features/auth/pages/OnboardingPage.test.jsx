import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))
const refreshProfile = vi.fn().mockResolvedValue()
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ refreshProfile, signOut: vi.fn(), user: { id: 'u' }, profileMissing: true }),
}))

const { default: OnboardingPage } = await import('./OnboardingPage')
const { savePendingInvite, clearPendingInvite, readPendingInvite } = await import('../authLinks')

const renderPage = () =>
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>
  )

describe('OnboardingPage', () => {
  beforeEach(() => {
    clearPendingInvite()
    mock.rpc.mockReset()
    refreshProfile.mockClear()
  })

  it('persona con link de coach: crea el perfil y manda el pedido compartiendo todo', async () => {
    savePendingInvite('ABCDEFG')
    mock.rpc
      .mockResolvedValueOnce({ data: { id: 'u', role: 'student' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'r' }, error: null })
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/tu nombre/i), 'Ana López')
    await user.click(screen.getByRole('button', { name: /empezar/i }))
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(2))
    expect(mock.rpc.mock.calls[0]).toEqual([
      'complete_signup',
      { p_name: 'Ana López', p_language: 'es', p_as_coach: false, p_also_trains: false },
    ])
    expect(mock.rpc.mock.calls[1]).toEqual([
      'request_coach_link',
      { p_code: 'ABCDEFG', p_share_history: true },
    ])
    expect(readPendingInvite()).toBeNull()
    expect(refreshProfile).toHaveBeenCalled()
  })

  it('coach que también entrena: no usa el link de invitación', async () => {
    savePendingInvite('ABCDEFG')
    mock.rpc.mockResolvedValueOnce({ data: { id: 'u', role: 'coach' }, error: null })
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/tu nombre/i), 'Wanda')
    await user.click(screen.getByLabelText(/las dos cosas/i))
    expect(screen.getByText(/no se va a usar/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /empezar/i }))
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(1))
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_as_coach: true, p_also_trains: true })
    expect(readPendingInvite()).toBeNull()
  })
})
