/**
 * Solución 1 (2026-10-19): lo resuelto ocupa una línea. Un grupo (A1/A2/…)
 * con todo resuelto queda como fila de resumen; adentro de un grupo abierto,
 * cada ejercicio resuelto es una fila densa. Corregir un dato vuelve a cerrar
 * el grupo.
 */
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StrengthBlockRunCard from './StrengthBlockRunCard'

function pe(id, name, order, label) {
  return {
    id,
    exercise_id: `ex-${id}`,
    exercise: { id: `ex-${id}`, name, default_weight_mode: 'bodyweight' },
    weight_mode: 'bodyweight',
    order_index: order,
    block_label: label,
    suggested_sets: 2,
    suggested_reps: '10',
    rest_time: null,
  }
}

const BLOCK = {
  id: 'blk-1',
  block_type: 'strength',
  title: 'warm up',
  plan_exercises: [
    pe('a1', 'Candelabro', 0, 'A1'),
    pe('a2', 'Colgarse', 1, 'A2'),
    pe('b1', 'Plancha', 2, 'B1'),
    pe('b2', 'Dead bug', 3, 'B2'),
  ],
}

const done = (id, pse) => ({
  id: `l-${id}`,
  completed: true,
  status: 'done',
  actual_sets: 2,
  perceived_difficulty: pse,
})

function Harness({ initialLogs = {} }) {
  const [logs, setLogs] = useState(initialLogs)
  const saveLog = vi.fn(async (id, data) => {
    setLogs((l) => ({
      ...l,
      [id]: {
        id: `log-${id}`,
        completed: data.p_status !== 'skipped',
        status: data.p_status || 'done',
        perceived_difficulty: data.p_perceived_difficulty ?? null,
        skip_reason: data.p_skip_reason ?? null,
      },
    }))
  })
  return (
    <StrengthBlockRunCard
      block={BLOCK}
      strengthIndexInSection={0}
      logs={logs}
      saveLog={saveLog}
      deleteLog={vi.fn()}
      loggedDate="2026-10-19"
    />
  )
}

beforeEach(() => localStorage.clear())

describe('lo resuelto en una línea', () => {
  it('grupo resuelto → fila de resumen; el grupo pendiente sigue entero', async () => {
    const user = userEvent.setup()
    render(<Harness initialLogs={{ a1: done('a1', 8), a2: done('a2', 9) }} />)
    await user.click(screen.getByText('warm up'))
    expect(screen.getByText(/Bloque A · 2\/2 hechos/)).toBeInTheDocument()
    expect(screen.getByText(/PSE 8–9/)).toBeInTheDocument()
    expect(screen.queryByText('Candelabro')).toBeNull()
    expect(screen.getByText('Plancha')).toBeInTheDocument()
  })

  it('tocar el resumen abre filas densas; tocar una fila abre la tarjeta', async () => {
    const user = userEvent.setup()
    render(<Harness initialLogs={{ a1: done('a1', 8), a2: done('a2', 9) }} />)
    await user.click(screen.getByText('warm up'))
    await user.click(screen.getByText(/Bloque A · 2\/2 hechos/))
    const row = screen.getByRole('button', { name: /ver o corregir colgarse/i })
    expect(within(row).getByText(/PSE 9/)).toBeInTheDocument()
    await user.click(row)
    expect(screen.queryByRole('button', { name: /ver o corregir colgarse/i })).toBeNull()
  })

  it('en un grupo con pendientes, lo resuelto es una fila densa', async () => {
    const user = userEvent.setup()
    render(<Harness initialLogs={{ b1: done('b1', 7) }} />)
    await user.click(screen.getByText('warm up'))
    expect(screen.getByRole('button', { name: /ver o corregir plancha/i })).toBeInTheDocument()
    expect(screen.getByText('Dead bug')).toBeInTheDocument()
  })

  it('al cerrar el último del grupo, el grupo pasa a resumen', async () => {
    const user = userEvent.setup()
    render(<Harness initialLogs={{ a1: done('a1', 8) }} />)
    await user.click(screen.getByText('warm up'))
    // El primer pendiente (A2) viene abierto por el bloque guiado.
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /PSE 6/i }))
    expect(screen.getByText(/Bloque A · 2\/2 hechos/)).toBeInTheDocument()
    expect(screen.queryByText('Colgarse')).toBeNull()
  })

  it('omitido → resumen en ámbar con el conteo', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initialLogs={{
          a1: done('a1', 8),
          a2: { id: 'l-a2', completed: false, status: 'skipped', skip_reason: 'time' },
        }}
      />
    )
    await user.click(screen.getByText('warm up'))
    expect(screen.getByText(/Bloque A · 1\/2 hechos · 1 omitido/)).toBeInTheDocument()
  })

  it('corregir un dato dentro del grupo lo vuelve a cerrar', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initialLogs={{
          a1: done('a1', 8),
          a2: { id: 'l-a2', completed: false, status: 'skipped', skip_reason: 'time' },
        }}
      />
    )
    await user.click(screen.getByText('warm up'))
    await user.click(screen.getByText(/Bloque A · 1\/2 hechos/))
    await user.click(screen.getByRole('button', { name: /ver o corregir colgarse/i }))
    const card = () => screen.getByText('Colgarse').closest('[class*="scroll-mt-20"]')
    await user.click(within(card()).getByRole('button', { name: /cambiar/i }))
    await user.click(within(card()).getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(within(card()).getByRole('button', { name: /PSE 7/i }))
    // Corregido: el grupo vuelve a su fila de resumen (ahora 2/2, en verde).
    expect(screen.getByText(/Bloque A · 2\/2 hechos/)).toBeInTheDocument()
    expect(screen.queryByText('Colgarse')).toBeNull()
  })
})
