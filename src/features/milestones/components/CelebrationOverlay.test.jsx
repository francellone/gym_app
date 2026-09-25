import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
// jsdom no tiene canvas: el confeti se prueba a mano en el teléfono.
vi.mock('../confetti', () => ({ fireConfetti: () => () => {} }))
const api = vi.hoisted(() => ({ voidPersonalBest: vi.fn().mockResolvedValue({ voided: true }) }))
vi.mock('../api', () => api)
import CelebrationOverlay from './CelebrationOverlay'
import { EDIT_LOG_EVENT } from '../editRequest'
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

  it('marca: toast con valores y "¿Es un error?" abre las dos opciones', async () => {
    const best = toCelebration({
      id: 'b1',
      kind: 'personal_best',
      payload: {
        metric: 'weight',
        value: 42.5,
        previous_max: 40,
        exercise_name: 'Sentadilla',
        plan_exercise_id: 'pe1',
      },
    })
    const onDismiss = vi.fn()
    renderItem(best, onDismiss)
    expect(screen.getByText('Mejor marca en Sentadilla')).toBeInTheDocument()
    expect(screen.getByText('42,5 kg. Tu máximo anterior era 40 kg.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '¿Es un error?' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const heard = vi.fn()
    window.addEventListener(EDIT_LOG_EVENT, heard)
    fireEvent.click(screen.getByRole('button', { name: 'Corregir el registro' }))
    window.removeEventListener(EDIT_LOG_EVENT, heard)
    expect(onDismiss).toHaveBeenCalled()
    expect(heard.mock.calls[0][0].detail).toEqual({ planExerciseId: 'pe1' })
    expect(api.voidPersonalBest).not.toHaveBeenCalled()
  })

  it('marca: anular sin cambiar el registro llama a la RPC', async () => {
    const best = toCelebration({
      id: 'b1',
      kind: 'personal_best',
      payload: { metric: 'weight', value: 42.5, previous_max: 40 },
    })
    const onDismiss = vi.fn()
    renderItem(best, onDismiss)
    fireEvent.click(screen.getByRole('button', { name: '¿Es un error?' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Anular la marca sin cambiar el registro' })
      )
    })
    expect(api.voidPersonalBest).toHaveBeenCalledWith({}, 'b1', 'student_void')
    expect(onDismiss).toHaveBeenCalled()
  })

  it('semana con racha: barritas, número y comodín ganado', () => {
    const w = {
      ...WEEK,
      stats: [...WEEK.stats, { value: '4', labelKey: 'celebrations.week.statStreak' }],
      streakWeeks: 4,
      freezeEarned: true,
    }
    renderItem(w)
    expect(screen.getByText('Racha de 4 semanas')).toBeInTheDocument()
    expect(screen.getByText(/Ganaste un comodín/)).toBeInTheDocument()
  })

  it('comodín usado: hoja sin confeti con la racha que sigue', () => {
    renderItem(toCelebration({ id: 'f1', kind: 'streak_freeze_used', payload: { streak: 6 } }))
    expect(screen.getByText('Nueva semana')).toBeInTheDocument()
    expect(screen.getByText('Usaste tu comodín')).toBeInTheDocument()
    expect(screen.getByText(/tu racha sigue en 6 semanas/)).toBeInTheDocument()
  })

  it('en inglés no se filtra español', async () => {
    await act(() => i18n.changeLanguage('en'))
    for (const item of [
      DAY,
      WEEK,
      { ...PLAN, message: null },
      toCelebration({ kind: 'streak', payload: { weeks: 3 } }),
      toCelebration({ kind: 'streak_freeze_used', payload: { streak: 3 } }),
    ]) {
      const { container, unmount } = renderItem(item)
      expect(container.textContent).not.toMatch(/[áéíóúñ¿¡]|Semana|Seguir|Cerrar|sesiones/)
      unmount()
    }
  })
})
