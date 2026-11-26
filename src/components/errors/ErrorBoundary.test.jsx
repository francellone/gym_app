import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'
import { isStaleChunkError } from './staleChunk'

function Boom({ fail }) {
  if (fail) throw new Error('render roto')
  return <p>contenido ok</p>
}

describe('ErrorBoundary', () => {
  let spy
  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  it('un error al dibujar muestra el aviso en vez de dejar todo en blanco', () => {
    render(
      <div>
        <p>menú</p>
        <ErrorBoundary variant="section">
          <Boom fail />
        </ErrorBoundary>
      </div>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('menú')).toBeInTheDocument()
  })

  it('se reinicia solo cuando cambia resetKey (otra pestaña o ruta)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Boom fail />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey="b">
        <Boom fail={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('contenido ok')).toBeInTheDocument()
  })

  it('Reintentar vuelve a dibujar el contenido', () => {
    let fail = true
    function Flaky() {
      if (fail) throw new Error('x')
      return <p>volvió</p>
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    )
    fail = false
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByText('volvió')).toBeInTheDocument()
  })

  it('reconoce los errores de archivos viejos después de un deploy', () => {
    expect(
      isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /a.js'))
    ).toBe(true)
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})
