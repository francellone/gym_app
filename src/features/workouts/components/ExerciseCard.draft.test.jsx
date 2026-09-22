/**
 * v54 — el borrador local (F4) frente al registro por confirmación.
 *
 * El hook escribe un borrador de cada tarjeta al montarse, aunque la persona
 * no toque nada. Antes, al volver, ese borrador se restauraba y la tarjeta
 * arrancaba en el formulario de edición: la vista de confirmación no
 * aparecía nunca en un ejercicio ya abierto. Caso real de Franco (2026-09-22):
 * Molino con un borrador ["5",""] de la lectura vieja → dos inputs, uno con 5
 * y otro vacío con un "5" gris de placeholder que guardaba NULL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExerciseCard from './ExerciseCard'
import { buildDraftKey, writeDraft, readDraft } from '../draftStorage'

const STUDENT = 'st-1'
const DATE = '2026-09-22'
const EX = 'ex-molino'

function planEx(overrides = {}) {
  return {
    id: 'pe-molino',
    exercise_id: EX,
    exercise: { id: EX, name: 'Molino Arrodillada', weight_mode: 'bodyweight' },
    weight_mode: 'bodyweight',
    suggested_sets: 2,
    suggested_reps: '5',
    suggested_weights: '["",""]',
    ...overrides,
  }
}

function seedDraft(payload) {
  const key = buildDraftKey({ studentId: STUDENT, planExerciseId: 'pe-molino', loggedDate: DATE })
  writeDraft(key, payload, window.localStorage, new Date().toISOString())
  return key
}

function renderCard(props = {}) {
  return render(
    <ExerciseCard
      planEx={planEx()}
      log={null}
      onSaveLog={vi.fn().mockResolvedValue(undefined)}
      onDeleteLog={vi.fn()}
      suggestedSets={2}
      studentId={STUDENT}
      loggedDate={DATE}
      {...props}
    />
  )
}

// Lo que la tarjeta arma sola al montar (prístino) para este ejercicio.
const PRISTINE = {
  actual_sets: '2',
  actual_reps_arr: ['5', '5'],
  actual_weights_arr: ['', ''],
  perceived_difficulty: null,
  notes: '',
  completed: false,
  weight_mode: 'bodyweight',
  unilateral: false,
  reps_unit: null,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('borrador igual a la prescripción', () => {
  it('se descarta en silencio y la tarjeta arranca en la vista de confirmación', async () => {
    const user = userEvent.setup()
    const key = seedDraft(PRISTINE)
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
    expect(screen.queryByText(/recuperamos/i)).not.toBeInTheDocument()
    expect(readDraft(key, window.localStorage)).toBeNull()
  })
})

describe('borrador con huecos (lectura vieja)', () => {
  it('el caso Molino: ["5",""] se rellena y, al quedar igual a lo prescripto, se descarta', async () => {
    const user = userEvent.setup()
    seedDraft({ ...PRISTINE, actual_reps_arr: ['5', ''] })
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    // Vista de confirmación compacta, sin inputs ni "5" gris.
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText(/reps por serie/i)).toBeInTheDocument()
  })

  it('un hueco en un borrador con cambios reales también se rellena', async () => {
    const user = userEvent.setup()
    // Cambió la serie 1 a 6 y la 2 quedó vacía por la lectura vieja.
    seedDraft({ ...PRISTINE, actual_reps_arr: ['6', ''] })
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    // Hay cambios → modo ajustar, y la serie 2 tiene el 5 prescripto como VALOR.
    expect(screen.getByDisplayValue('6')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
  })
})

describe('borrador con cambios reales', () => {
  it('se restaura en el modo ajustar con el hint de recuperación', async () => {
    const user = userEvent.setup()
    seedDraft({ ...PRISTINE, actual_reps_arr: ['6', '6'], perceived_difficulty: 7 })
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    expect(screen.getAllByDisplayValue('6')).toHaveLength(2)
    expect(screen.getByText(/recuperamos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lo hice tal cual/i })).not.toBeInTheDocument()
  })

  it('descartar vuelve a la vista de confirmación con lo prescripto', async () => {
    const user = userEvent.setup()
    seedDraft({ ...PRISTINE, actual_reps_arr: ['6', '6'] })
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    await user.click(screen.getByRole('button', { name: /descartar/i }))
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('6')).not.toBeInTheDocument()
  })
})

describe('los inputs del modo ajustar no muestran números falsos', () => {
  it('un input vacío muestra un guion, no la prescripción en gris', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByText('Molino Arrodillada'))
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
    const inputs = screen.getAllByDisplayValue('5')
    await user.clear(inputs[1])
    expect(inputs[1]).toHaveAttribute('placeholder', '—')
  })
})
