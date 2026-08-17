/**
 * Regresión del bug de agosto 2026: un formulario cuyas preguntas están todas
 * marcadas "solo alumnos en el otro idioma" (hidden_for) llegaba VACÍO y el
 * botón "¡Empezar!" no hacía nada — sin cartel, sin error, sin pista.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormRenderer from './FormRenderer'

function assignment({ hiddenFor } = {}) {
  return {
    id: 'assign-1',
    form_kind: 'follow_up',
    template_name: 'Formulario mensual',
    form_snapshot: {
      name: 'Formulario mensual',
      kind: 'follow_up',
      intro: { content: 'Contame cómo venís este mes' },
      modules: [
        {
          id: 'm1',
          title: 'Entrada en calor',
          emoji: '🔥',
          order: 1,
          enabled: true,
          questions: [
            {
              id: 'q1',
              type: 'text',
              label: '¿Cómo te sentiste?',
              required: false,
              ...(hiddenFor ? { hidden_for: hiddenFor } : {}),
            },
          ],
        },
      ],
    },
  }
}

describe('FormRenderer — formulario sin pasos', () => {
  it('avisa que el formulario llegó vacío en vez de mostrar un botón muerto', () => {
    render(<FormRenderer assignment={assignment({ hiddenFor: ['es'] })} studentId="s1" />)

    expect(screen.getByText(/llegó vacío/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /empezar/i })).not.toBeInTheDocument()
  })

  it('ofrece volver al inicio si el caller pasa onFinish', async () => {
    const onFinish = vi.fn()
    render(
      <FormRenderer
        assignment={assignment({ hiddenFor: ['es'] })}
        studentId="s1"
        onFinish={onFinish}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /volver al inicio/i }))
    expect(onFinish).toHaveBeenCalled()
  })

  it('con preguntas visibles, "¡Empezar!" avanza al primer módulo', async () => {
    render(<FormRenderer assignment={assignment()} studentId="s1" />)

    const start = screen.getByRole('button', { name: /empezar/i })
    await userEvent.click(start)

    expect(screen.getByText('¿Cómo te sentiste?')).toBeInTheDocument()
    expect(screen.queryByText(/llegó vacío/i)).not.toBeInTheDocument()
  })
})
