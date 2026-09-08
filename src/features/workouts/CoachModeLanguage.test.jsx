// ============================================================
// Guardia del aislamiento de idioma del MODO COACH
// ------------------------------------------------------------
// Lo que estos tests protegen (y que es fácil de romper sin darse cuenta):
//  1. La pantalla de registro sale en el idioma de la ALUMNA, no en el de la
//     coach.
//  2. Ese idioma NO se filtra a la instancia global: el panel de la coach
//     tiene que quedar como estaba. Cuando se traduzca el panel (etapa 2),
//     esta es la línea que impide que poner el panel en inglés arrastre la
//     pantalla de la alumna, y al revés.
//  3. El selector cambia el idioma de la pantalla y sigue sin tocar el global.
//  4. Fuera del modo coach el selector no existe.
// Diseño: src/features/workouts/CoachModeLanguage.jsx
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { createSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock, supabaseIsolated: supabaseMock }))

const { default: CoachModeLanguageProvider } = await import('./CoachModeLanguage')
const { default: CoachModeLangToggle } = await import('./components/CoachModeLangToggle')

// Sonda: pinta el idioma efectivo del contexto y un texto traducido real.
function Probe() {
  const { t, i18n: scoped } = useTranslation()
  return (
    <>
      <span data-testid="lang">{scoped.language}</span>
      <span data-testid="text">{t('workout.coachModeBanner', { name: 'Jessi' })}</span>
      <CoachModeLangToggle />
    </>
  )
}

function renderCoachMode() {
  return render(
    <MemoryRouter initialEntries={['/coach/students/abc-123/workout']}>
      <Routes>
        <Route
          path="/coach/students/:id/workout"
          element={
            <CoachModeLanguageProvider>
              <Probe />
            </CoachModeLanguageProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

function mockStudentLanguage(language) {
  supabaseMock._chain.maybeSingle.mockResolvedValueOnce({ data: { language }, error: null })
}

describe('idioma del modo coach', () => {
  beforeEach(async () => {
    // El panel de la coach está en español (default de la app y del setup).
    await i18n.changeLanguage('es')
    supabaseMock.from.mockClear()
    supabaseMock._chain.maybeSingle.mockReset()
    supabaseMock._chain.maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('alumna con perfil en inglés: la pantalla sale en inglés', async () => {
    mockStudentLanguage('en')
    renderCoachMode()

    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('en'))
    expect(supabaseMock.from).toHaveBeenCalledWith('profiles')
    const text = screen.getByTestId('text').textContent
    expect(text).toContain('Jessi')
    expect(text).not.toMatch(/[áéíóúñ]/i)
  })

  it('el idioma de la pantalla NO se filtra al panel de la coach', async () => {
    mockStudentLanguage('en')
    renderCoachMode()

    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('en'))
    expect(i18n.language).toBe('es')
  })

  it('alumna con perfil en español: la pantalla sale en español', async () => {
    mockStudentLanguage('es')
    renderCoachMode()

    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('es'))
    expect(screen.getByTestId('text').textContent).toMatch(/Registrando por Jessi/)
  })

  it('sin idioma cargado en el perfil cae en español, no rompe', async () => {
    mockStudentLanguage(null)
    renderCoachMode()

    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('es'))
    expect(i18n.language).toBe('es')
  })

  it('el selector cambia el idioma de la pantalla y deja el global quieto', async () => {
    const user = userEvent.setup()
    mockStudentLanguage('es')
    renderCoachMode()
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('es'))

    await user.click(screen.getByRole('button', { name: 'EN' }))

    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('en'))
    expect(screen.getByTestId('text').textContent).not.toMatch(/[áéíóúñ]/i)
    expect(i18n.language).toBe('es')

    await user.click(screen.getByRole('button', { name: 'ES' }))
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('es'))
  })

  it('fuera del modo coach el selector no se pinta', () => {
    render(
      <MemoryRouter>
        <CoachModeLangToggle />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: 'EN' })).toBeNull()
  })
})
