/**
 * Bloque guiado (2026-10-16): al resolver un ejercicio su tarjeta se pliega
 * y se abre el siguiente pendiente de abajo; con el bloque completo, el
 * bloque se pliega y pide abrir el siguiente.
 */
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StrengthBlockRunCard from './StrengthBlockRunCard'
import { onBlockOpenRequest } from '../guidedFlow'

function pe(id, name, order) {
  return {
    id,
    exercise_id: `ex-${id}`,
    exercise: { id: `ex-${id}`, name, default_weight_mode: 'bodyweight' },
    weight_mode: 'bodyweight',
    order_index: order,
    suggested_sets: 2,
    suggested_reps: '10',
    rest_time: null,
  }
}

const BLOCK = {
  id: 'blk-1',
  title: 'Bloque B',
  plan_exercises: [pe('pe-1', 'Remo A', 0), pe('pe-2', 'Remo B', 1), pe('pe-3', 'Remo C', 2)],
}

// El padre real proyecta el registro en `logs` al guardar; acá igual.
function Harness({ initialLogs = {}, nextBlockId = 'blk-2' }) {
  const [logs, setLogs] = useState(initialLogs)
  const saveLog = vi.fn(async (id, data) => {
    setLogs((l) => ({
      ...l,
      [id]: {
        id: `log-${id}`,
        completed: data.p_status !== 'skipped',
        status: data.p_status || 'done',
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
      loggedDate="2026-10-16"
      nextBlockId={nextBlockId}
    />
  )
}

const cardOf = (name) => screen.getByText(name).closest('[class*="scroll-mt-20"]')

async function confirm(user, name) {
  const card = cardOf(name)
  await user.click(within(card).getByRole('button', { name: /lo hice tal cual/i }))
  await user.click(within(card).getByRole('button', { name: /PSE 4/i }))
}

beforeEach(() => localStorage.clear())

describe('bloque guiado', () => {
  it('al abrir el bloque, el primer pendiente ya viene abierto', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Bloque B'))
    expect(within(cardOf('Remo A')).getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
    expect(within(cardOf('Remo B')).queryByText(/lo que te dejó tu coach/i)).toBeNull()
  })

  it('confirmar pliega la tarjeta y abre la siguiente', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Bloque B'))
    await confirm(user, 'Remo A')
    expect(within(cardOf('Remo A')).queryByText(/lo que te dejó tu coach/i)).toBeNull()
    expect(within(cardOf('Remo B')).getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
  })

  it('si abajo no queda nada pendiente, no vuelve hacia arriba', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Bloque B'))
    // Registra fuera de orden: abre y confirma C primero.
    await user.click(screen.getByText('Remo C'))
    await confirm(user, 'Remo C')
    expect(within(cardOf('Remo A')).getByText(/lo que te dejó tu coach/i)).toBeInTheDocument() // seguía abierta
    expect(within(cardOf('Remo C')).queryByText(/lo que te dejó tu coach/i)).toBeNull()
    expect(within(cardOf('Remo B')).queryByText(/lo que te dejó tu coach/i)).toBeNull()
  })

  it('bloque completo → se pliega y pide abrir el siguiente', async () => {
    const user = userEvent.setup()
    const asked = vi.fn()
    const off = onBlockOpenRequest(asked)
    render(<Harness />)
    await user.click(screen.getByText('Bloque B'))
    await confirm(user, 'Remo A')
    await confirm(user, 'Remo B')
    await confirm(user, 'Remo C')
    await waitFor(() => expect(asked).toHaveBeenCalledWith('blk-2'))
    expect(screen.queryByText('Remo A')).toBeNull() // bloque plegado
    off()
  })

  it('corregir un ejercicio ya hecho no mueve nada', async () => {
    const user = userEvent.setup()
    const asked = vi.fn()
    const off = onBlockOpenRequest(asked)
    render(
      <Harness
        initialLogs={{
          'pe-1': { id: 'l1', completed: true, status: 'done' },
          'pe-2': { id: 'l2', completed: true, status: 'done' },
        }}
      />
    )
    await user.click(screen.getByText('Bloque B'))
    // El primer pendiente es C
    expect(within(cardOf('Remo C')).getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
    await confirm(user, 'Remo C')
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))
    off()
  })

  it('omitir también avanza', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Bloque B'))
    const card = cardOf('Remo A')
    await user.click(within(card).getByRole('button', { name: /no lo hice/i }))
    const reasons = within(cardOf('Remo A')).getAllByRole('button')
    const time = reasons.find((b) => /tiempo/i.test(b.textContent))
    await user.click(time)
    expect(within(cardOf('Remo B')).getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
  })
})
