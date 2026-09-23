/**
 * v54 — registro por confirmación en el aeróbico + el campo de rondas.
 * Caso real: AEROBICO BICI, intervalos, 6 rondas de 60'' x 60'', 12 min, Z3.
 * Tenía 4 registros con 12 min y rondas NULL porque no había dónde cargarlas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AerobicBlockRunCard from './AerobicBlockRunCard'

function bici(overrides = {}) {
  return {
    id: 'blk-bici',
    block_type: 'aerobic',
    title: 'AEROBICO BICI',
    aerobic_format: 'intervals',
    aerobic_rounds: 6,
    aerobic_work_seconds: 60,
    aerobic_rest_seconds: 60,
    aerobic_total_minutes: 12,
    aerobic_zone: 'Z3',
    plan_exercises: [
      { id: 'pe-bici', exercise_id: 'ex-bici', exercise: { id: 'ex-bici', name: 'Bici' } },
    ],
    ...overrides,
  }
}

function renderCard(props = {}) {
  const onSaveLog = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <AerobicBlockRunCard
      block={bici()}
      blockLog={null}
      onSaveLog={onSaveLog}
      onDeleteLog={vi.fn()}
      loggedDate="2026-09-23"
      {...props}
    />
  )
  return { ...utils, onSaveLog }
}

async function expand(user) {
  await user.click(screen.getByText('AEROBICO BICI'))
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('vista de confirmación', () => {
  it('muestra formato, rondas con trabajo/pausa, minutos y la zona como referencia', async () => {
    const user = userEvent.setup()
    renderCard()
    await expand(user)
    expect(screen.getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
    expect(screen.getByText(/^rondas$/i)).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText(/60'' x 60''/)).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/zona de referencia/i)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})

describe('CONFIRMAR guarda minutos Y rondas prescriptas', () => {
  it('el toque sobre el PSE guarda 12 min, 6 rondas y entry_mode=confirmed', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^4/ }))
    expect(onSaveLog).toHaveBeenCalledTimes(1)
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({
      actual_minutes: 12,
      actual_rounds: 6,
      perceived_difficulty: 4,
      completed: true,
      status: 'done',
      skip_reason: null,
      entry_mode: 'confirmed',
    })
  })

  it('sin minutos en el plan pero con rondas y trabajo, los minutos se derivan', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ block: bici({ aerobic_total_minutes: null }) })
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^3/ }))
    // 6 rondas × (60 + 60) s = 12 min
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ actual_minutes: 12, actual_rounds: 6 })
  })

  it('un continuo sin rondas confirma solo los minutos, con rondas en null', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({
      block: bici({
        aerobic_format: 'continuous',
        aerobic_rounds: null,
        aerobic_work_seconds: null,
        aerobic_rest_seconds: null,
        aerobic_total_minutes: 20,
      }),
    })
    await expand(user)
    expect(screen.queryByText(/^rondas$/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^2/ }))
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ actual_minutes: 20, actual_rounds: null })
  })
})

describe('AJUSTAR: el campo de rondas y el recálculo de minutos', () => {
  it('bajar de 6 a 4 rondas de 60x60 lleva los minutos de 12 a 8, y se puede pisar', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
    const rounds = screen.getByRole('spinbutton', { name: /rondas/i })
    const minutes = screen.getByRole('spinbutton', { name: /duración/i })
    expect(rounds).toHaveValue(6)
    expect(minutes).toHaveValue(12)
    await user.clear(rounds)
    await user.type(rounds, '4')
    expect(minutes).toHaveValue(8)
    // Pisar los minutos a mano no toca las rondas
    await user.clear(minutes)
    await user.type(minutes, '9')
    expect(rounds).toHaveValue(4)
    await user.click(screen.getByRole('button', { name: /^5/ }))
    await user.click(screen.getByRole('button', { name: /marcar como completado/i }))
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({
      actual_rounds: 4,
      actual_minutes: 9,
      entry_mode: 'edited',
    })
  })

  it('el campo de rondas no aparece en un continuo', async () => {
    const user = userEvent.setup()
    renderCard({
      block: bici({
        aerobic_format: 'continuous',
        aerobic_rounds: null,
        aerobic_total_minutes: 20,
      }),
    })
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
    expect(screen.queryByRole('spinbutton', { name: /rondas/i })).not.toBeInTheDocument()
  })
})

describe('NO LO HICE', () => {
  it('guarda el bloque omitido con motivo y todo en null', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /no lo hice/i }))
    await user.click(screen.getByRole('button', { name: /me molestaba algo/i }))
    expect(onSaveLog.mock.calls[0][0]).toEqual({
      actual_minutes: null,
      actual_rounds: null,
      perceived_difficulty: null,
      notes: null,
      completed: false,
      status: 'skipped',
      skip_reason: 'discomfort',
      entry_mode: null,
    })
  })

  it('un omitido se muestra con el motivo y en modo coach en tercera persona', async () => {
    const user = userEvent.setup()
    renderCard({
      coachMode: true,
      blockLog: { id: 'bl-1', completed: false, status: 'skipped', skip_reason: 'time' },
    })
    expect(screen.getByText(/no lo hizo/i)).toBeInTheDocument()
    expect(screen.getByText(/no llegó con el tiempo/i)).toBeInTheDocument()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /cambiar/i }))
    expect(screen.getByRole('button', { name: /lo hizo tal cual/i })).toBeInTheDocument()
  })
})
