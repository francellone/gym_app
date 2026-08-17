/**
 * "Aprieto Cerrar sesión y no pasa nada" (agosto 2026).
 *
 * navigator.serviceWorker.ready NUNCA resuelve si no hay SW activo, y
 * unregisterPush se esperaba antes de cerrar sesión. Acá simulamos ese cuelgue
 * (y también el de supabase.auth.signOut) y verificamos que igual se cierra.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const nunca = () => new Promise(() => {})

vi.mock('@/features/notifications/services/pushService', () => ({
  registerPush: vi.fn(),
  unregisterPush: vi.fn(nunca), // el caso real: se queda colgado para siempre
}))

vi.mock('./authSnapshot', () => ({
  readAuthSnapshot: () => null,
  writeAuthSnapshot: vi.fn(),
  clearAuthSnapshot: vi.fn(),
}))

vi.mock('@/features/workouts/workoutSnapshot', () => ({
  clearWorkoutSnapshots: vi.fn(),
}))

const { AuthProvider, useAuth } = await import('./AuthContext')

function Consumer() {
  const { user, signOut } = useAuth()
  return (
    <>
      <span data-testid="user">{user ? user.id : 'sin sesión'}</span>
      <button onClick={() => signOut()}>Cerrar sesión</button>
    </>
  )
}

async function renderLogueado() {
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'a@b.com' } } },
  })
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  )
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  resetSupabaseMock(supabaseMock)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('signOut a prueba de cuelgues', () => {
  it('cierra la sesión aunque unregisterPush nunca resuelva', async () => {
    await renderLogueado()
    expect(screen.getByTestId('user')).toHaveTextContent('u1')

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000) // > timeout de push (3s)
    })

    expect(supabaseMock.auth.signOut).toHaveBeenCalled()
    expect(screen.getByTestId('user')).toHaveTextContent('sin sesión')
  })

  it('cierra la sesión aunque supabase.auth.signOut se cuelgue', async () => {
    supabaseMock.auth.signOut.mockImplementation(nunca)
    await renderLogueado()

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000) // 3s push + 5s signOut
    })

    expect(screen.getByTestId('user')).toHaveTextContent('sin sesión')
  })
})
