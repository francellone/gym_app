/**
 * Reporte "Finalizar no hace nada" (Diana, 2026-09): al enviar con una
 * obligatoria vacía no se veía por qué; el borrador no se recuperaba; un
 * envío fallido podía mostrar "¡Listo!". Arreglado 2026-10-14.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormRenderer from './FormRenderer'
import { readLocalDraft, writeLocalDraft } from '../shared/draftStorage'

const assignment = {
  id: 'assign-d',
  form_kind: 'follow_up',
  template_name: 'Formulario mensual',
  form_snapshot: {
    name: 'Formulario mensual',
    kind: 'follow_up',
    intro: { content: 'Intro' },
    modules: [
      {
        id: 'm1',
        title: 'Uno',
        order: 1,
        enabled: true,
        questions: [{ id: 'q1', type: 'text', label: 'Primera', required: true }],
      },
      {
        id: 'm2',
        title: 'Dos',
        order: 2,
        enabled: true,
        questions: [{ id: 'q2', type: 'text', label: 'Segunda', required: true }],
      },
    ],
  },
}

const start = () => userEvent.click(screen.getByRole('button', { name: /empezar/i }))
const next = () => userEvent.click(screen.getByRole('button', { name: /continuar/i }))
const submit = () => userEvent.click(screen.getByRole('button', { name: /enviar formulario/i }))

describe('FormRenderer — envío y borradores', () => {
  beforeEach(() => {
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('al enviar con una obligatoria vacía avisa cuántas faltan y no envía', async () => {
    const onSubmit = vi.fn()
    render(<FormRenderer assignment={assignment} studentId="s" onSubmit={onSubmit} />)
    await start()
    await userEvent.type(screen.getByRole('textbox'), 'bien')
    await next()
    await submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/falta 1 respuesta obligatoria/i)
  })

  it('guarda lo escrito en el dispositivo y lo recupera al volver a abrir', async () => {
    const { unmount } = render(<FormRenderer assignment={assignment} studentId="s" />)
    await start()
    await userEvent.type(screen.getByRole('textbox'), 'me costó')
    expect(readLocalDraft('assign-d')).toEqual({ q1: 'me costó' })
    unmount()

    render(<FormRenderer assignment={assignment} studentId="s" />)
    await start()
    expect(screen.getByRole('textbox')).toHaveValue('me costó')
  })

  it('usa el borrador de la base si es más completo que el local', async () => {
    writeLocalDraft('assign-d', { q1: 'local' })
    render(
      <FormRenderer
        assignment={assignment}
        studentId="s"
        initialResponses={{ q1: 'base', q2: 'también' }}
      />
    )
    await start()
    expect(screen.getByRole('textbox')).toHaveValue('base')
  })

  it('al pasar de página guarda el borrador en la base', async () => {
    const onSaveDraft = vi.fn(async () => {})
    render(<FormRenderer assignment={assignment} studentId="s" onSaveDraft={onSaveDraft} />)
    await start()
    await userEvent.type(screen.getByRole('textbox'), 'ok')
    await next()
    expect(onSaveDraft).toHaveBeenCalledWith({ q1: 'ok' })
  })

  it('si el envío falla no muestra "¡Listo!" y conserva el borrador', async () => {
    const onSubmit = async () => {
      throw new Error('red')
    }
    render(<FormRenderer assignment={assignment} studentId="s" onSubmit={onSubmit} />)
    await start()
    await userEvent.type(screen.getByRole('textbox'), 'a')
    await next()
    await userEvent.type(screen.getByRole('textbox'), 'b')
    await submit()
    expect(screen.queryByText(/listo/i)).not.toBeInTheDocument()
    expect(readLocalDraft('assign-d')).toEqual({ q1: 'a', q2: 'b' })
  })

  it('un envío correcto borra el borrador del dispositivo', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<FormRenderer assignment={assignment} studentId="s" onSubmit={onSubmit} />)
    await start()
    await userEvent.type(screen.getByRole('textbox'), 'a')
    await next()
    await userEvent.type(screen.getByRole('textbox'), 'b')
    await submit()
    expect(screen.getByText(/listo/i)).toBeInTheDocument()
    expect(readLocalDraft('assign-d')).toBeNull()
  })

  it('"Guardar borrador" avisa si no se pudo guardar', async () => {
    const onSaveDraft = async () => {
      throw new Error('red')
    }
    render(<FormRenderer assignment={assignment} studentId="s" onSaveDraft={onSaveDraft} />)
    await start()
    await userEvent.click(screen.getByRole('button', { name: /guardar borrador/i }))
    expect(screen.getByRole('button', { name: /no se guardó/i })).toBeInTheDocument()
  })
})
