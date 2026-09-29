import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))
let auth = {}
vi.mock('../AuthContext', () => ({ useAuth: () => auth }))

const { default: JoinInvitePage } = await import('./JoinInvitePage')
const { readPendingInvite, clearPendingInvite } = await import('../authLinks')

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/unirme/:code" element={<JoinInvitePage />} />
        <Route path="/signup" element={<p>pantalla de registro</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('JoinInvitePage', () => {
  beforeEach(() => {
    clearPendingInvite()
    mock.rpc.mockReset()
  })

  it('sin sesión guarda el código y manda a crear cuenta', async () => {
    auth = { user: null, profile: null, profileMissing: false, loading: false }
    mock.rpc.mockResolvedValue({ data: 'Anto', error: null })
    renderAt('/unirme/abcdefg')
    expect(await screen.findByText('pantalla de registro')).toBeInTheDocument()
    expect(readPendingInvite()).toBe('ABCDEFG')
  })

  it('persona sin coach elige no compartir y manda el pedido', async () => {
    auth = {
      user: { id: 'u' },
      profile: { id: 'u', role: 'student', coach_id: null },
      profileMissing: false,
      loading: false,
    }
    mock.rpc
      .mockResolvedValueOnce({ data: 'Anto', error: null })
      .mockResolvedValueOnce({ data: { id: 'r' }, error: null })
    const user = userEvent.setup()
    renderAt('/unirme/ABCDEFG')
    const submit = await screen.findByRole('button', { name: /mandar pedido/i })
    expect(submit).toBeDisabled() // hay que elegir sí o no
    await user.click(screen.getByLabelText(/solo lo que entrene desde ahora/i))
    await user.click(submit)
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenLastCalledWith('request_coach_link', {
        p_code: 'ABCDEFG',
        p_share_history: false,
      })
    )
    expect(await screen.findByText(/le mandamos tu pedido a anto/i)).toBeInTheDocument()
  })

  it('una coach no puede sumarse a otra', async () => {
    auth = {
      user: { id: 'c' },
      profile: { id: 'c', role: 'coach' },
      profileMissing: false,
      loading: false,
    }
    mock.rpc.mockResolvedValueOnce({ data: 'Anto', error: null })
    renderAt('/unirme/ABCDEFG')
    expect(await screen.findByText(/cuenta de coach no te podés sumar/i)).toBeInTheDocument()
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})
