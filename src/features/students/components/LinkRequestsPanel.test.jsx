import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const fetchPendingLinkRequests = vi.fn()
const decideLinkRequest = vi.fn()
vi.mock('../linkRequestsApi', () => ({
  fetchPendingLinkRequests: (...a) => fetchPendingLinkRequests(...a),
  decideLinkRequest: (...a) => decideLinkRequest(...a),
}))
vi.mock('@/features/avatars/AvatarImage', () => ({ default: ({ children }) => children }))

const { default: LinkRequestsPanel } = await import('./LinkRequestsPanel')

const req = (id, name, share) => ({
  request_id: id,
  student_id: `s-${id}`,
  name,
  email: `${name.toLowerCase()}@mail.com`,
  avatar_url: null,
  share_history: share,
  created_at: '2026-09-29T10:00:00Z',
})

describe('LinkRequestsPanel', () => {
  beforeEach(() => {
    fetchPendingLinkRequests.mockReset()
    decideLinkRequest.mockReset()
  })

  it('sin pedidos no muestra nada', async () => {
    fetchPendingLinkRequests.mockResolvedValue([])
    const { container } = render(<LinkRequestsPanel />)
    await waitFor(() => expect(fetchPendingLinkRequests).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lista pedidos con mail y si comparte lo anterior', async () => {
    fetchPendingLinkRequests.mockResolvedValue([req('1', 'Ana', true), req('2', 'Beto', false)])
    render(<LinkRequestsPanel />)
    expect(await screen.findByText(/2 personas quieren sumarse/i)).toBeInTheDocument()
    expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
    expect(screen.getByText(/comparte lo que entrenó antes/i)).toBeInTheDocument()
    expect(screen.getByText(/solo vas a ver lo que entrene/i)).toBeInTheDocument()
  })

  it('aceptar decide, saca el pedido y refresca la lista de personas', async () => {
    fetchPendingLinkRequests.mockResolvedValue([req('1', 'Ana', true)])
    decideLinkRequest.mockResolvedValue({})
    const onAccepted = vi.fn()
    const user = userEvent.setup()
    render(<LinkRequestsPanel onAccepted={onAccepted} />)
    await user.click(await screen.findByRole('button', { name: /aceptar a ana/i }))
    expect(decideLinkRequest).toHaveBeenCalledWith('1', true)
    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
  })

  it('rechazar no refresca la lista de personas', async () => {
    fetchPendingLinkRequests.mockResolvedValue([req('1', 'Ana', true)])
    decideLinkRequest.mockResolvedValue({})
    const onAccepted = vi.fn()
    const user = userEvent.setup()
    render(<LinkRequestsPanel onAccepted={onAccepted} />)
    await user.click(await screen.findByRole('button', { name: /rechazar a ana/i }))
    expect(decideLinkRequest).toHaveBeenCalledWith('1', false)
    await waitFor(() => expect(screen.queryByText('Ana')).not.toBeInTheDocument())
    expect(onAccepted).not.toHaveBeenCalled()
  })
})
