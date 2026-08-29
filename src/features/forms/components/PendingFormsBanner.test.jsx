/**
 * Regresión del caso del 29/8/2026 (Franco Cellone): un formulario asignado y
 * pendiente que el alumno "no veía". La base estaba bien y el dispositivo
 * recibía la fila; el problema era que el ÚNICO acceso era el cartel del
 * Inicio. Ahora el cartel vive en StudentLayout y se ve en toda la app.
 *
 * Estos tests fijan el contrato del cartel: aparece cuando hay pendientes,
 * apunta al formulario correcto según form_kind y desaparece si no hay nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockUsePendingForms = vi.fn()

vi.mock('@/features/forms/hooks/usePendingForms', async () => {
  const actual = await vi.importActual('@/features/forms/hooks/usePendingForms')
  return {
    ...actual,
    usePendingForms: (...args) => mockUsePendingForms(...args),
  }
})

const { formPathFor } = await import('./../hooks/usePendingForms')
const PendingFormsBanner = (await import('./PendingFormsBanner')).default

function renderBanner() {
  return render(
    <MemoryRouter>
      <PendingFormsBanner studentId="alumno-1" />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUsePendingForms.mockReset()
})

describe('PendingFormsBanner', () => {
  it('no muestra nada si el alumno no tiene formularios pendientes', () => {
    mockUsePendingForms.mockReturnValue({ intake: null, followUps: [] })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('linkea directo al formulario de seguimiento cuando hay uno solo', () => {
    mockUsePendingForms.mockReturnValue({
      intake: null,
      followUps: [{ id: 'assign-9', form_kind: 'follow_up' }],
    })
    renderBanner()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/student/form/assign-9')
  })

  it('manda al listado cuando hay más de un seguimiento pendiente', () => {
    mockUsePendingForms.mockReturnValue({
      intake: null,
      followUps: [
        { id: 'a1', form_kind: 'follow_up' },
        { id: 'a2', form_kind: 'follow_up' },
      ],
    })
    renderBanner()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/student/forms')
  })

  it('el intake tiene prioridad y va a su página propia', () => {
    mockUsePendingForms.mockReturnValue({
      intake: { id: 'intake-1', form_kind: 'intake' },
      followUps: [{ id: 'a1', form_kind: 'follow_up' }],
    })
    renderBanner()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/student/intake')
  })
})

describe('formPathFor', () => {
  it('rutea el intake a su página y el seguimiento por assignmentId', () => {
    expect(formPathFor({ id: 'x', form_kind: 'intake' })).toBe('/student/intake')
    expect(formPathFor({ id: 'x', form_kind: 'follow_up' })).toBe('/student/form/x')
    expect(formPathFor(null)).toBe('/student/forms')
  })
})
