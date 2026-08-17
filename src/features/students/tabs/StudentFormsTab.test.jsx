/**
 * Cancelar un envío de formulario (agosto 2026): antes no había forma de sacar
 * un formulario mal enviado y quedaba para siempre en la lista de la alumna.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const { default: StudentFormsTab } = await import('./StudentFormsTab')

const PENDING = {
  id: 'assign-1',
  status: 'pending',
  form_kind: 'follow_up',
  trigger_type: 'manual',
  intake_form_templates: { name: 'Formulario mensual' },
}
const DONE = {
  id: 'assign-2',
  status: 'completed',
  form_kind: 'follow_up',
  trigger_type: 'manual',
  completed_at: '2026-08-01T12:00:00Z',
  intake_form_templates: { name: 'Formulario viejo' },
}

/** Encola respuestas del builder en el orden en que el componente las consume. */
function queue(responses) {
  let i = 0
  supabaseMock._chain.then.mockImplementation((resolve) =>
    resolve(responses[Math.min(i++, responses.length - 1)])
  )
}

const ok = (data) => ({ data, error: null })

let confirmSpy
let alertSpy

beforeEach(() => {
  resetSupabaseMock(supabaseMock)
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
})

// Ojo: vi.restoreAllMocks() acá rompería el chain mock de supabase (le borra
// los mockReturnValue). Restauramos solo los spies del window.
afterEach(() => {
  confirmSpy.mockRestore()
  alertSpy.mockRestore()
})

describe('StudentFormsTab — cancelar envío', () => {
  it('borra el envío pendiente y refresca la lista', async () => {
    queue([
      ok([PENDING]), // assignments
      ok([]), // submissions
      ok([{ id: 'assign-1' }]), // delete ... .select('id')
      ok([]), // reload assignments
      ok([]), // reload submissions
    ])

    render(<StudentFormsTab studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('Formulario mensual')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(window.confirm).toHaveBeenCalled()
    expect(supabaseMock._chain.delete).toHaveBeenCalled()
    expect(supabaseMock._chain.eq).toHaveBeenCalledWith('id', 'assign-1')
    expect(supabaseMock._chain.select).toHaveBeenCalledWith('id')
    await waitFor(() => expect(screen.queryByText('Formulario mensual')).not.toBeInTheDocument())
  })

  it('si el DELETE no borra nada (RLS), avisa y no vacía la lista', async () => {
    queue([ok([PENDING]), ok([]), ok([])]) // el delete devuelve 0 filas

    render(<StudentFormsTab studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('Formulario mensual')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => expect(window.alert).toHaveBeenCalled())
    expect(screen.getByText('Formulario mensual')).toBeInTheDocument()
  })

  it('un formulario ya respondido no se puede cancelar', async () => {
    queue([ok([DONE]), ok([])])

    render(<StudentFormsTab studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('Formulario viejo')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument()
  })

  it('si ya empezó a responder, el confirm lo aclara', async () => {
    queue([
      ok([{ ...PENDING, status: 'in_progress' }]),
      ok([{ assignment_id: 'assign-1', responses: { q1: 'algo' } }]),
      ok([{ id: 'assign-1' }]),
      ok([]),
      ok([]),
    ])

    render(<StudentFormsTab studentId="stu-1" />)
    await waitFor(() => expect(screen.getByText('Formulario mensual')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/ya empezó a responder/i))
  })
})
