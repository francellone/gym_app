/**
 * Guardia de envío: un formulario cuyas preguntas están todas marcadas para el
 * OTRO idioma le llega vacío a la alumna (bug de agosto 2026). El modal tiene
 * que avisarlo y no dejar mandarlo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const { default: SendToStudentModal } = await import('./SendToStudentModal')

const STUDENTS = [
  { id: 'ana', name: 'Ana', email: 'ana@test.com', language: 'es' },
  { id: 'becky', name: 'Becky', email: 'becky@test.com', language: 'en' },
]

function config({ hiddenFor } = {}) {
  return {
    name: 'Formulario mensual',
    modules: [
      {
        id: 'm1',
        title: 'Bloque principal',
        order: 1,
        enabled: true,
        questions: [
          {
            id: 'q1',
            type: 'text',
            label: '¿Cómo venís?',
            ...(hiddenFor ? { hidden_for: hiddenFor } : {}),
          },
        ],
      },
    ],
  }
}

function renderModal(formConfig) {
  return render(
    <SendToStudentModal
      coachId="coach-1"
      formConfig={formConfig}
      templateId="tpl-1"
      formKind="intake"
      onClose={vi.fn()}
      onSent={vi.fn()}
    />
  )
}

beforeEach(() => {
  resetSupabaseMock(supabaseMock)
  supabaseMock._chain.then.mockImplementation((resolve) =>
    resolve({ data: STUDENTS, error: null })
  )
})

describe('SendToStudentModal — formulario vacío para un idioma', () => {
  it('avisa y deshabilita a la alumna que no vería ninguna pregunta', async () => {
    renderModal(config({ hiddenFor: ['es'] }))

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument())

    expect(screen.getByText(/no tiene ninguna pregunta para alumnos en/i)).toBeInTheDocument()
    expect(screen.getByText(/no tiene preguntas en su idioma \(es\)/i)).toBeInTheDocument()

    expect(screen.getByText('Ana').closest('button')).toBeDisabled()
    expect(screen.getByText('Becky').closest('button')).not.toBeDisabled()
  })

  it('"Todos" no selecciona a quien recibiría el formulario vacío', async () => {
    renderModal(config({ hiddenFor: ['es'] }))
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))

    expect(screen.getByRole('button', { name: /Enviar a 1/ })).toBeInTheDocument()
  })

  it('sin hidden_for no molesta a nadie', async () => {
    renderModal(config())
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument())

    expect(screen.queryByText(/no tiene ninguna pregunta/i)).not.toBeInTheDocument()
    expect(screen.getByText('Ana').closest('button')).not.toBeDisabled()
  })
})
