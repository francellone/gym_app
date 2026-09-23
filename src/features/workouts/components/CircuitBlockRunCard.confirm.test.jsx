/**
 * v54 — registro por confirmación a NIVEL BLOQUE en el circuito.
 * Un solo confirmar para todo el bloque: guarda el registro del bloque más
 * uno por ejercicio con lo prescripto. No lo hice guarda SOLO el bloque.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CircuitBlockRunCard from './CircuitBlockRunCard'

const BURPEES = { id: 'ex-burpees', name: 'Burpees', default_weight_mode: 'bodyweight' }
const KB = { id: 'ex-kb', name: 'Swing Kettlebell', default_weight_mode: 'with_weight' }
const PLANCHA = { id: 'ex-plancha', name: 'Plancha', default_weight_mode: 'bodyweight' }

function block(overrides = {}) {
  return {
    id: 'blk-tabata',
    block_type: 'circuit',
    title: 'TABATA',
    circuit_type: 'hiit',
    circuit_rounds: 4,
    circuit_work_seconds: 20,
    circuit_rest_seconds: 10,
    circuit_total_minutes: 3,
    plan_exercises: [
      {
        id: 'pe-1',
        exercise_id: BURPEES.id,
        exercise: BURPEES,
        exercise_mode: 'reps',
        suggested_reps: '10',
        suggested_sets: 1,
      },
      {
        id: 'pe-2',
        exercise_id: KB.id,
        exercise: KB,
        exercise_mode: 'reps',
        suggested_reps: '15',
        suggested_weights: '["16"]',
        suggested_sets: 1,
      },
      {
        id: 'pe-3',
        exercise_id: PLANCHA.id,
        exercise: PLANCHA,
        exercise_mode: 'time',
        duration_seconds: 30,
        suggested_sets: 1,
      },
    ],
    ...overrides,
  }
}

function renderCard(props = {}) {
  const onSaveBlockLog = vi.fn().mockResolvedValue(undefined)
  const onSaveExerciseLog = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <CircuitBlockRunCard
      block={block()}
      blockLog={null}
      exerciseLogs={{}}
      onSaveBlockLog={onSaveBlockLog}
      onSaveExerciseLog={onSaveExerciseLog}
      onDeleteBlockLog={vi.fn()}
      loggedDate="2026-09-23"
      {...props}
    />
  )
  return { ...utils, onSaveBlockLog, onSaveExerciseLog }
}

async function expand(user) {
  await user.click(screen.getByText('TABATA'))
}

// La tarjeta persiste "desplegado" en localStorage por bloque+día: sin esto
// un test la abre y el siguiente la cierra.
beforeEach(() => {
  window.localStorage.clear()
})

describe('vista de confirmación del circuito', () => {
  it('muestra rondas, minutos y cada ejercicio en lectura, sin inputs', async () => {
    const user = userEvent.setup()
    renderCard()
    await expand(user)
    expect(screen.getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument() // rondas
    expect(screen.getByText('3')).toBeInTheDocument() // minutos
    // La línea de lectura (la de prescripción del header también dice "10 reps")
    expect(screen.getAllByText(/10 reps/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/15 reps · 16 kg/i)).toBeInTheDocument()
    expect(screen.getAllByText(/30 ?s/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
  })
})

describe('CONFIRMAR: un solo toque guarda el bloque y cada ejercicio', () => {
  it('bloque con rondas/minutos prescriptos y PSE; ejercicios con lo prescripto', async () => {
    const user = userEvent.setup()
    const { onSaveBlockLog, onSaveExerciseLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^7/ }))

    expect(onSaveBlockLog).toHaveBeenCalledTimes(1)
    expect(onSaveBlockLog.mock.calls[0][0]).toMatchObject({
      actual_rounds: 4,
      actual_minutes: 3,
      perceived_difficulty: 7,
      completed: true,
      status: 'done',
      skip_reason: null,
      entry_mode: 'confirmed',
    })
    // Tres ejercicios, tres logs, todos confirmados
    expect(onSaveExerciseLog).toHaveBeenCalledTimes(3)
    const byId = Object.fromEntries(onSaveExerciseLog.mock.calls.map(([id, d]) => [id, d]))
    expect(byId['pe-1']).toMatchObject({
      p_reps: [10],
      p_weights: null,
      p_entry_mode: 'confirmed',
      p_status: 'done',
    })
    expect(byId['pe-2']).toMatchObject({ p_reps: [15], p_weights: [16], p_entry_mode: 'confirmed' })
    expect(byId['pe-3']).toMatchObject({
      p_reps: [],
      _noteBody: 'Tiempo: 30s',
      p_entry_mode: 'confirmed',
    })
  })

  it('un ejercicio con peso sin cargar se confirma igual, avisando, y va con peso vacío', async () => {
    const user = userEvent.setup()
    const { onSaveExerciseLog } = renderCard({
      block: block({
        plan_exercises: [
          {
            id: 'pe-2',
            exercise_id: KB.id,
            exercise: KB,
            exercise_mode: 'reps',
            suggested_reps: '15',
            suggested_sets: 1,
          },
        ],
      }),
    })
    await expand(user)
    expect(screen.getByText(/sin peso cargado: swing kettlebell/i)).toBeInTheDocument()
    expect(screen.getByText(/15 reps · sin peso/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^5/ }))
    expect(onSaveExerciseLog.mock.calls[0][1]).toMatchObject({ p_reps: [15], p_weights: [null] })
  })

  it('el peso sin prescribir se propone desde el último registro y se dice', async () => {
    const user = userEvent.setup()
    const lastLogByExercise = new Map([
      [
        KB.id,
        { completed: true, status: 'done', logged_date: '2026-09-18', actual_weights_jsonb: [20] },
      ],
    ])
    const { onSaveExerciseLog } = renderCard({
      block: block({
        plan_exercises: [
          {
            id: 'pe-2',
            exercise_id: KB.id,
            exercise: KB,
            exercise_mode: 'reps',
            suggested_reps: '15',
            suggested_sets: 1,
          },
        ],
      }),
      lastLogByExercise,
    })
    await expand(user)
    expect(screen.getByText(/15 reps · 20 kg/i)).toBeInTheDocument()
    expect(screen.getByText(/lo último que cargaste/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /^6/ }))
    expect(onSaveExerciseLog.mock.calls[0][1]).toMatchObject({ p_weights: [20] })
  })
})

describe('NO LO HICE: solo el registro del bloque, ninguno por ejercicio', () => {
  it('guarda el bloque omitido con motivo y datos en null', async () => {
    const user = userEvent.setup()
    const { onSaveBlockLog, onSaveExerciseLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /no lo hice/i }))
    await user.click(screen.getByRole('button', { name: /elegí no hacerlo/i }))
    expect(onSaveBlockLog).toHaveBeenCalledTimes(1)
    expect(onSaveBlockLog.mock.calls[0][0]).toEqual({
      actual_minutes: null,
      actual_rounds: null,
      perceived_difficulty: null,
      notes: null,
      completed: false,
      status: 'skipped',
      skip_reason: 'choice',
      entry_mode: null,
    })
    expect(onSaveExerciseLog).not.toHaveBeenCalled()
  })

  it('un bloque omitido se muestra como tal y permite cambiar', async () => {
    const user = userEvent.setup()
    renderCard({
      blockLog: { id: 'bl-1', completed: false, status: 'skipped', skip_reason: 'time' },
    })
    expect(screen.getByText(/no lo hiciste/i)).toBeInTheDocument()
    expect(screen.getByText(/no llegué con el tiempo/i)).toBeInTheDocument()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /cambiar/i }))
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
  })
})

describe('AJUSTAR: los campos vienen prellenados con lo prescripto', () => {
  it('abre los inputs con 10, 15, 16 y 30 y guarda con entry_mode=edited', async () => {
    const user = userEvent.setup()
    const { onSaveBlockLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('16')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^8/ }))
    await user.click(screen.getByRole('button', { name: /marcar bloque/i }))
    expect(onSaveBlockLog.mock.calls[0][0]).toMatchObject({
      entry_mode: 'edited',
      perceived_difficulty: 8,
    })
  })
})

describe('modo coach', () => {
  it('habla en tercera persona', async () => {
    const user = userEvent.setup()
    renderCard({ coachMode: true })
    await expand(user)
    expect(screen.getByText(/lo que le dejaste/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lo hizo tal cual/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^no lo hizo$/i })).toBeInTheDocument()
  })
})
