import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import CelebrationOverlay from './CelebrationOverlay'
import { toCelebration, TOAST_MS } from '../celebrationModel'

const renderItem = (item, onDismiss = vi.fn()) =>
  render(
    <MemoryRouter>
      <CelebrationOverlay item={item} onDismiss={onDismiss} />
    </MemoryRouter>
  )

const DAY = toCelebration({
  id: 'd1',
  kind: 'day_complete',
  period_key: '2026-09-22',
  payload: { day_id: 'day_a' },
})
const WEEK = toCelebration({
  id: 'w1',
  kind: 'week_complete',
  payload: { expected: 3, completed: 3, week_start: '2026-09-21' },
})
const PLAN = toCelebration({
  id: 'p1',
  kind: 'plan_complete',
  payload: {
    tone: 'strong',
    adherence: 0.92,
    sessions_closed: 11,
    sessions_expected: 12,
    weeks_complete: 4,
    plan_title: 'Plan Fuerza',
    message: 'Gran laburo.',
  },
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  await i18n.changeLanguage('es')
})

describe('CelebrationOverlay', () => {
  it('sin item no pinta nada', () => {
    const { container } = renderItem(null)
    expect(container.textContent).toBe('')
  })

  it('día: toast que se va solo', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    renderItem(DAY, onDismiss)
    expect(screen.getByText('¡Día A completo!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(TOAST_MS + 10))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('semana: hoja con rango, sesiones y botón Seguir', () => {
    const onDismiss = vi.fn()
    renderItem(WEEK, onDismiss)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Semana del 21/9 al 27/9')).toBeInTheDocument()
    expect(screen.getByText('Hiciste las 3 sesiones previstas.')).toBeInTheDocument()
    expect(screen.getByText('3/3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('semana: Escape cierra', () => {
    const onDismiss = vi.fn()
    renderItem(WEEK, onDismiss)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('plan: tono, "de cada 10", mensaje de la coach tal cual', () => {
    renderItem(PLAN)
    expect(screen.getByText('¡Terminaste tu plan!')).toBeInTheDocument()
    expect(screen.getByText('Entrenaste 9 de cada 10 sesiones previstas.')).toBeInTheDocument()
    expect(screen.getByText('Gran laburo.')).toBeInTheDocument()
    expect(screen.getByText('11/12')).toBeInTheDocument()
  })

  it('plan sin mensaje: usa el automático según el tono', () => {
    const gentle = toCelebration({
      kind: 'plan_complete',
      payload: { tone: 'gentle', adherence: 0.25, sessions_closed: 3, sessions_expected: 12 },
    })
    renderItem(gentle)
    expect(screen.getByText(/Estas semanas fueron difíciles/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'Hiciste 3 de las 12 sesiones previstas. Con tu coach pueden ver cómo seguir.'
      )
    ).toBeInTheDocument()
  })

  it('en inglés no se filtra español', async () => {
    await act(() => i18n.changeLanguage('en'))
    for (const item of [DAY, WEEK, { ...PLAN, message: null }]) {
      const { container, unmount } = renderItem(item)
      expect(container.textContent).not.toMatch(/[áéíóúñ¿¡]|Semana|Seguir|Cerrar|sesiones/)
      unmount()
    }
  })
})
