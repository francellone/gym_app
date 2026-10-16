import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const getStudentThread = vi.fn()
let mockProfile = { id: 'p1', coach_id: null }

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ profile: mockProfile }) }))
vi.mock('../api', () => ({ getStudentThread: (...a) => getStudentThread(...a) }))
vi.mock('../components/NotesPanel', () => ({
  default: ({ threadId, personal }) => (
    <div data-testid="panel">{`${threadId}:${personal ? 'personal' : 'coach'}`}</div>
  ),
}))

vi.mock('@/features/chat/components/ChatConversation', () => ({
  default: ({ threadId }) => <div data-testid="chat">{`${threadId}:chat`}</div>,
}))

const { default: NotesPage } = await import('./StudentNotesPage')

describe('StudentNotesPage (v67 + chat v75)', () => {
  beforeEach(() => {
    getStudentThread.mockReset()
    getStudentThread.mockImplementation((_id, opts) =>
      Promise.resolve({ data: { id: opts?.private ? 'personal' : 'coach-thread' }, error: null })
    )
  })

  it('sin coach: solo el hilo personal, sin pestañas', async () => {
    mockProfile = { id: 'p1', coach_id: null }
    render(<NotesPage />)
    expect(await screen.findByTestId('panel')).toHaveTextContent('personal:personal')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(getStudentThread).toHaveBeenCalledWith('p1', { private: true })
  })

  it('con coach: arranca en el chat con la coach y cambia a privadas', async () => {
    mockProfile = { id: 'p1', coach_id: 'c1' }
    render(<NotesPage />)
    expect(await screen.findByTestId('chat')).toHaveTextContent('coach-thread:chat')
    fireEvent.click(screen.getAllByRole('tab')[1])
    await waitFor(() => expect(screen.getByTestId('panel')).toHaveTextContent('personal:personal'))
    expect(getStudentThread).toHaveBeenLastCalledWith('p1', { private: true })
  })
})
