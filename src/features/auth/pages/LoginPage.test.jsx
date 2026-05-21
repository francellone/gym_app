// ============================================================
// LoginPage — primer component test
// ------------------------------------------------------------
// Foco: el form llama a signIn con email/password limpios, y muestra
// "Email o contraseña incorrectos" cuando signIn tira.
//
// Estrategia de mock: en lugar de mockear @/lib/supabase (que es lo
// que usa AuthContext por debajo), mockeamos el hook useAuth directo.
// Más barato y más explícito sobre qué estamos testeando: la UI del
// LoginPage, no la integración con Supabase.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock del AuthContext antes del import de LoginPage
const signIn = vi.fn()
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ signIn, user: null, profile: null, loading: false }),
}))

const { default: LoginPage } = await import('./LoginPage')

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset()
  })

  it('renderiza email, password y botón "Ingresar"', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument()
  })

  it('submit válido llama signIn con email + password exactos', async () => {
    signIn.mockResolvedValueOnce({ user: { id: 'u1' } })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'coach@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))

    expect(signIn).toHaveBeenCalledWith('coach@example.com', 'secret123')
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('muestra "Email o contraseña incorrectos" cuando signIn rechaza', async () => {
    signIn.mockRejectedValueOnce(new Error('Invalid login credentials'))
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'badpass')
    await user.click(screen.getByRole('button', { name: /ingresar/i }))

    expect(await screen.findByText(/email o contraseña incorrectos/i)).toBeInTheDocument()
  })

  it('toggle de mostrar/ocultar password cambia el type del input', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const pwdInput = screen.getByLabelText(/contraseña/i)
    expect(pwdInput).toHaveAttribute('type', 'password')

    // El botón eye no tiene texto, lo busco por su posición dentro del wrapper
    // del input. Hay un solo botón type="button" dentro del form (el ojo).
    const toggleBtn = pwdInput.parentElement.querySelector('button[type="button"]')
    await user.click(toggleBtn)
    expect(pwdInput).toHaveAttribute('type', 'text')

    await user.click(toggleBtn)
    expect(pwdInput).toHaveAttribute('type', 'password')
  })

  it('botón Ingresar queda disabled mientras signIn está pendiente', async () => {
    let resolveSignIn
    signIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignIn = resolve
      })
    )

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'x@y.com')
    await user.type(screen.getByLabelText(/contraseña/i), 'z')

    const submit = screen.getByRole('button', { name: /ingresar/i })
    await user.click(submit)

    // Mientras está en vuelo, el botón está disabled
    expect(submit).toBeDisabled()

    // Resolvemos dentro de act y esperamos el re-render para no dejar
    // updates colgando que disparan el warning "not wrapped in act(...)".
    await act(async () => {
      resolveSignIn({ user: { id: 'u1' } })
    })
    await waitFor(() => expect(submit).not.toBeDisabled())
  })
})
