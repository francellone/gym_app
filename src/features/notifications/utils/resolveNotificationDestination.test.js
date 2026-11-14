// ============================================================
// /n/:id — destino de un aviso al celular (v81)
// ------------------------------------------------------------
// El push solo trae el id del aviso. Acá se fija que el destino sale de la
// misma función que usa la campana y que "leída" se marca solo cuando
// corresponde. Supabase mockeado: sin red y sin rastro.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const { resolveNotificationDestination } = await import('./resolveNotificationDestination')

function notificationIs(row) {
  supabaseMock._chain.maybeSingle.mockResolvedValueOnce({ data: row, error: null })
}

describe('resolveNotificationDestination', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    supabaseMock._chain.then.mockImplementation((resolve) => resolve({ data: [], error: null }))
    supabaseMock._chain.maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('nota de una persona → su chat, y NO se marca leída (eso lo hace el chat)', async () => {
    notificationIs({ id: 'n1', type: 'student_note', data: { student_id: 's1' }, read: false })
    expect(await resolveNotificationDestination('n1')).toBe('/coach/chat/s1')
    expect(supabaseMock._chain.update).not.toHaveBeenCalled()
  })

  it('formulario enviado → ficha de la persona, y se marca leída', async () => {
    notificationIs({ id: 'n2', type: 'form_submitted', data: { student_id: 's1' }, read: false })
    expect(await resolveNotificationDestination('n2')).toBe('/coach/students/s1')
    expect(supabaseMock._chain.update).toHaveBeenCalledWith({ read: true })
  })

  it('evaluación completada → pestaña de evaluaciones', async () => {
    notificationIs({
      id: 'n3',
      type: 'evaluation_completed',
      data: { student_id: 's1' },
      read: true,
    })
    expect(await resolveNotificationDestination('n3')).toBe('/coach/students/s1?tab=evaluaciones')
    expect(supabaseMock._chain.update).not.toHaveBeenCalled()
  })

  it('pedido de vínculo → lista de personas', async () => {
    notificationIs({ id: 'n4', type: 'coach_link_request', data: {}, read: false })
    expect(await resolveNotificationDestination('n4')).toBe('/coach/students')
  })

  it('aviso inexistente o de otra persona (RLS no lo devuelve) → sin destino', async () => {
    expect(await resolveNotificationDestination('nope')).toBeNull()
    expect(supabaseMock._chain.update).not.toHaveBeenCalled()
  })
})
