import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  fetchMyCatalogAccess: vi.fn(),
  requestCatalogAccess: vi.fn(),
  fetchCatalogRequests: vi.fn(),
  decideCatalogAccess: vi.fn(),
}))
vi.mock('../catalogAccessApi', () => api)
vi.mock('@/features/avatars/AvatarImage', () => ({ default: ({ children }) => children }))

const { default: CatalogAccessCard } = await import('./CatalogAccessCard')

describe('CatalogAccessCard (v72)', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.requestCatalogAccess.mockResolvedValue(undefined)
    api.decideCatalogAccess.mockResolvedValue(undefined)
  })

  it('coach sin pedido: pide y pasa a pendiente', async () => {
    api.fetchMyCatalogAccess
      .mockResolvedValueOnce({ is_owner: false, owner_name: 'Anto', status: null })
      .mockResolvedValueOnce({ is_owner: false, owner_name: 'Anto', status: 'pending' })
    render(<CatalogAccessCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir el catálogo' }))
    expect(await screen.findByText('Pedido enviado')).toBeInTheDocument()
    expect(api.requestCatalogAccess).toHaveBeenCalled()
  })

  it('coach aprobado: solo una línea informativa', async () => {
    api.fetchMyCatalogAccess.mockResolvedValue({
      is_owner: false,
      owner_name: 'Anto',
      status: 'approved',
    })
    render(<CatalogAccessCard />)
    expect(await screen.findByText('Estás usando el catálogo de Anto.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('dueña: aprueba un pedido pendiente', async () => {
    api.fetchMyCatalogAccess.mockResolvedValue({ is_owner: true, owner_name: 'Anto', status: null })
    api.fetchCatalogRequests.mockResolvedValue([
      { coach_id: 'c1', name: 'Carlos Sosa', email: 'c@x.com', status: 'pending' },
    ])
    render(<CatalogAccessCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(api.decideCatalogAccess).toHaveBeenCalledWith('c1', true))
  })

  it('dueña sin pedidos: no muestra nada', async () => {
    api.fetchMyCatalogAccess.mockResolvedValue({ is_owner: true, owner_name: 'Anto', status: null })
    api.fetchCatalogRequests.mockResolvedValue([])
    const { container } = render(<CatalogAccessCard />)
    await waitFor(() => expect(api.fetchCatalogRequests).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
