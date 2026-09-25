import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { autoCompletionMessage, normalizeCompletionMessage } from './completionMessage'
import CompletionMessageField from './components/CompletionMessageField'

describe('normalizeCompletionMessage', () => {
  it('el automático sin cambios o vacío se guarda como NULL (cada persona lo ve en su idioma)', () => {
    expect(normalizeCompletionMessage(null)).toBeNull()
    expect(normalizeCompletionMessage('   ')).toBeNull()
    expect(normalizeCompletionMessage(autoCompletionMessage())).toBeNull()
    expect(normalizeCompletionMessage(`  ${autoCompletionMessage()}  `)).toBeNull()
  })
  it('un texto propio se guarda recortado y con tope de 1000', () => {
    expect(normalizeCompletionMessage('  Gran laburo  ')).toBe('Gran laburo')
    expect(normalizeCompletionMessage('x'.repeat(1200))).toHaveLength(1000)
  })
})

function Harness({ initial = null, spy = vi.fn() }) {
  const [v, setV] = useState(initial)
  return (
    <CompletionMessageField
      value={v}
      onChange={(x) => {
        spy(x)
        setV(x)
      }}
    />
  )
}

describe('CompletionMessageField', () => {
  it('arranca con el automático y lo explica', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Mensaje al terminar el plan')).toHaveValue(
      autoCompletionMessage()
    )
    expect(screen.getByText(/cada persona lo ve en su idioma/)).toBeInTheDocument()
  })
  it('al escribir uno propio cambia la ayuda y deja volver al automático', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Mensaje al terminar el plan'), {
      target: { value: 'Bien ahí' },
    })
    expect(screen.getByText(/tal cual en la pantalla de cierre/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al automático' }))
    expect(screen.getByLabelText('Mensaje al terminar el plan')).toHaveValue(
      autoCompletionMessage()
    )
  })
})
