import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createSupabaseMock } from '@/test/mocks/supabase'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))

const { default: SignupPage } = await import('./SignupPage')
const { readPendingInvite, clearPendingInvite } = await import('../authLinks')

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SignupPage />
    </MemoryRouter>
  )
}

describe('SignupPage', () => {
  beforeEach(() => {
    clearPendingInvite()
    mock.rpc.mockReset()
    mock.auth.signUp.mockReset()
  })

  it('con link de coach válido muestra a quién se suma y guarda el código', async () => {
    mock.rpc.mockResolvedValueOnce({ data: 'Anto', error: null })
    renderAt('/signup?invite=abcdefg')
    expect(await screen.findByText(/te estás sumando con anto/i)).toBeInTheDocument()
    expect(mock.rpc).toHaveBeenCalledWith('resolve_invite_code', { p_code: 'ABCDEFG' })
    expect(readPendingInvite()).toBe('ABCDEFG')
  })

  it('con link inválido avisa pero deja crear la cuenta', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: null })
    renderAt('/signup?invite=ABCDEFG')
    expect(await screen.findByText(/no es válido/i)).toBeInTheDocument()
    expect(readPendingInvite()).toBeNull()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeEnabled()
  })

  it('no manda nada si las contraseñas no coinciden', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(screen.getByLabelText(/email/i), 'ana@mail.com')
    await user.type(screen.getByLabelText(/^contraseña$/i), '123456')
    await user.type(screen.getByLabelText(/repetí/i), '123457')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(mock.auth.signUp).not.toHaveBeenCalled()
  })

  it('registra con redirección al login y pide revisar el mail', async () => {
    mock.auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'n' } }, error: null })
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(screen.getByLabelText(/email/i), ' ana@mail.com ')
    await user.type(screen.getByLabelText(/^contraseña$/i), '123456')
    await user.type(screen.getByLabelText(/repetí/i), '123456')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    await waitFor(() => expect(mock.auth.signUp).toHaveBeenCalledTimes(1))
    const arg = mock.auth.signUp.mock.calls[0][0]
    expect(arg.email).toBe('ana@mail.com')
    expect(arg.password).toBe('123456')
    expect(arg.options.emailRedirectTo).toMatch(/\/login$/)
    expect(await screen.findByText(/revisá tu mail/i)).toBeInTheDocument()
  })

  it('traduce el error de registro cerrado', async () => {
    mock.auth.signUp.mockResolvedValueOnce({
      data: null,
      error: new Error('Signups not allowed for this instance'),
    })
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(screen.getByLabelText(/email/i), 'ana@mail.com')
    await user.type(screen.getByLabelText(/^contraseña$/i), '123456')
    await user.type(screen.getByLabelText(/repetí/i), '123456')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(await screen.findByText(/registro está cerrado/i)).toBeInTheDocument()
  })
})
