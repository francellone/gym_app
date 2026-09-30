import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  fetchCoachDirectory: vi.fn(),
  fetchMyPendingCoachRequest: vi.fn(),
  requestListedCoach: vi.fn(),
  cancelCoachRequest: vi.fn(),
}))
vi.mock('../coachDirectory', async (orig) => ({ ...(await orig()), ...api }))
vi.mock('@/features/avatars/AvatarImage', () => ({ default: ({ children }) => children }))

const { default: CoachDirectoryPage } = await import('./CoachDirectoryPage')

const coaches = [
  {
    id: 'a',
    name: 'Anto Almanza',
    coach_city: 'Córdoba',
    coach_work_mode: 'both',
    coach_languages: ['es'],
    bio: { es: 'Entreno fuerza' },
  },
  {
    id: 'b',
    name: 'Bea Ruiz',
    coach_city: 'Rosario',
    coach_work_mode: 'online',
    coach_languages: ['es'],
    bio: { es: 'Running' },
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <CoachDirectoryPage />
    </MemoryRouter>
  )
}

describe('CoachDirectoryPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.fetchCoachDirectory.mockResolvedValue(coaches)
    api.fetchMyPendingCoachRequest.mockResolvedValue(null)
    api.requestListedCoach.mockResolvedValue(undefined)
  })

  it('lista y filtra por ciudad', async () => {
    renderPage()
    expect(await screen.findByText('Anto Almanza')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar por ciudad'), { target: { value: 'rosario' } })
    expect(screen.queryByText('Anto Almanza')).not.toBeInTheDocument()
    expect(screen.getByText('Bea Ruiz')).toBeInTheDocument()
  })

  it('pedir sumarme exige elegir si comparte el historial', async () => {
    renderPage()
    await screen.findByText('Anto Almanza')
    fireEvent.click(screen.getAllByRole('button', { name: 'Pedir sumarme' })[0])
    const send = screen.getByRole('button', { name: 'Mandar pedido' })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByLabelText('No, solo lo que entrene desde ahora'))
    fireEvent.click(send)
    await waitFor(() => expect(api.requestListedCoach).toHaveBeenCalledWith('a', false))
  })

  it('con un pedido pendiente no deja pedirle a otra', async () => {
    api.fetchMyPendingCoachRequest.mockResolvedValue({ coach_id: 'a', coach_name: 'Anto Almanza' })
    renderPage()
    expect(await screen.findByText(/Tu pedido a Anto Almanza está pendiente/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pedir sumarme' })).toBeDisabled()
  })
})
