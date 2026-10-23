/**
 * 2026-10-22 — "Con tu coach" en la tarjeta del ejercicio: se ven los
 * últimos mensajes y se contesta ahí mismo, sin registrar ni ir al Chat.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseHistoryBodyBlock } from './ExerciseHistoryPreview'
import { ExerciseChatContext } from '../exerciseChatContext'

const note = (id, author_role, body, created_at = '2026-10-20T10:00:00Z') => ({
  id,
  author_role,
  body,
  created_at,
  visibility: 'shared',
  deleted_at: null,
  source_note_id: null,
})

function renderBox(notes, { viewerRole = 'student', send = vi.fn().mockResolvedValue(true) } = {}) {
  const value = { notesByExercise: new Map([['ex-1', notes]]), viewerRole, send }
  render(
    <ExerciseChatContext.Provider value={value}>
      <ExerciseHistoryBodyBlock exerciseId="ex-1" onOpenChat={vi.fn()} />
    </ExerciseChatContext.Provider>
  )
  return { send }
}

describe('Con tu coach (recuadro del ejercicio)', () => {
  it('muestra los dos últimos mensajes y responde desde la tarjeta', async () => {
    const user = userEvent.setup()
    const { send } = renderBox([
      note('1', 'student', 'viejo'),
      note('2', 'student', 'Me molestó la rodilla'),
      note('3', 'coach', '¿Cómo te fue hoy?'),
    ])
    expect(screen.queryByText('viejo')).not.toBeInTheDocument()
    expect(screen.getByText('Me molestó la rodilla')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo te fue hoy?')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/responderle a tu coach/i), 'Mucho mejor')
    await user.click(screen.getByRole('button', { name: /enviar/i }))
    expect(send).toHaveBeenCalledWith('ex-1', 'Mucho mejor')
    expect(screen.getByRole('button', { name: /ver los 3 mensajes/i })).toBeInTheDocument()
  })

  it('sin mensajes no ocupa lugar', () => {
    const { container } = render(
      <ExerciseChatContext.Provider
        value={{ notesByExercise: new Map(), viewerRole: 'student', send: vi.fn() }}
      >
        <ExerciseHistoryBodyBlock exerciseId="ex-1" />
      </ExerciseChatContext.Provider>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('si falla el envío, avisa y deja el texto', async () => {
    const user = userEvent.setup()
    renderBox([note('3', 'coach', 'Hola')], { send: vi.fn().mockResolvedValue(false) })
    const input = screen.getByPlaceholderText(/responderle a tu coach/i)
    await user.type(input, 'dale')
    await user.click(screen.getByRole('button', { name: /enviar/i }))
    expect(screen.getByText(/no se pudo enviar/i)).toBeInTheDocument()
    expect(input).toHaveValue('dale')
  })
})
