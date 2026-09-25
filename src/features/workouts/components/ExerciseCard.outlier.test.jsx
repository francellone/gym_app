/**
 * Etapa 4 celebraciones — aviso al cargar un valor que duplica el máximo
 * previo de la persona (con al menos 3 registros). Avisa, nunca bloquea.
 * Y "¿Es un error? Corregir" desde la celebración abre la tarjeta en ajustar.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExerciseCard from './ExerciseCard'
import { requestLogEdit } from '@/features/milestones/editRequest'

const planEx = {
  id: 'pe-1',
  exercise_id: 'ex-press',
  exercise: { id: 'ex-press', name: 'Press Banca', weight_mode: 'with_weight' },
  weight_mode: 'with_weight',
  suggested_sets: 3,
  suggested_reps: '[10,10,10]',
  suggested_weights: '[12,12,12]',
  rest_time: null,
  suggested_weight: null,
}
const REF = {
  weight: { count: 3, max: 12 },
  reps: { count: 0, max: null },
  seconds: { count: 0, max: null },
}

function renderCard(props = {}) {
  const onSaveLog = vi.fn().mockResolvedValue(undefined)
  render(
    <ExerciseCard
      planEx={planEx}
      log={null}
      onSaveLog={onSaveLog}
      onDeleteLog={vi.fn()}
      suggestedSets={3}
      loggedDate="2026-09-25"
      bestReference={REF}
      {...props}
    />
  )
  return { onSaveLog }
}

async function adjustWeightTo(user, value) {
  await user.click(screen.getByText('Press Banca'))
  await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
  const weights = screen.getAllByDisplayValue('12')
  await user.clear(weights[0])
  await user.type(weights[0], value)
  await user.click(screen.getByRole('button', { name: '6' }))
  await user.click(screen.getByRole('button', { name: /marcar como completado/i }))
}

describe('aviso de valor raro', () => {
  it('28 kg contra un máximo de 12: pregunta antes de guardar y deja guardar igual', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await adjustWeightTo(user, '28')
    expect(onSaveLog).not.toHaveBeenCalled()
    expect(
      screen.getByText(/¿Son 28 kg\? Tu máximo en este ejercicio es 12 kg/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /guardar igual/i }))
    expect(onSaveLog).toHaveBeenCalledTimes(1)
    expect(onSaveLog.mock.calls[0][1].p_weights[0]).toBe(28)
  })

  it('Corregir vuelve sin guardar', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await adjustWeightTo(user, '28')
    await user.click(screen.getByRole('button', { name: /^corregir$/i }))
    expect(onSaveLog).not.toHaveBeenCalled()
    expect(screen.queryByText(/¿Son 28 kg/)).not.toBeInTheDocument()
  })

  it('hasta el doble justo no avisa', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await adjustWeightTo(user, '24')
    expect(onSaveLog).toHaveBeenCalledTimes(1)
  })

  it('con poca historia no avisa', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ bestReference: { ...REF, weight: { count: 2, max: 12 } } })
    await adjustWeightTo(user, '40')
    expect(onSaveLog).toHaveBeenCalledTimes(1)
  })
})

describe('pedido de corrección desde la celebración', () => {
  it('abre la tarjeta en modo ajustar', async () => {
    renderCard()
    expect(screen.queryAllByDisplayValue('12')).toHaveLength(0)
    act(() => requestLogEdit('pe-1'))
    expect(screen.getAllByDisplayValue('12').length).toBeGreaterThan(0)
  })

  it('ignora pedidos de otro ejercicio', () => {
    renderCard()
    act(() => requestLogEdit('pe-otro'))
    expect(screen.queryAllByDisplayValue('12')).toHaveLength(0)
  })
})
