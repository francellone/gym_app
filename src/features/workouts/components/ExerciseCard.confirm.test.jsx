/**
 * v54 — registro por confirmación. La tarjeta muestra lo prescripto en
 * lectura y ofrece tres salidas: confirmar (con PSE inline), ajustar (se
 * abren los campos, con cascada desde la serie 1) y no lo hice (con motivo).
 *
 * Lo que se verifica acá es el CONTRATO con la RPC: qué payload sale por
 * onSaveLog en cada camino. El render exacto importa menos que eso.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExerciseCard from './ExerciseCard'

const EXERCISE_ID = 'ex-remo'

function planEx(overrides = {}) {
  return {
    id: 'pe-1',
    exercise_id: EXERCISE_ID,
    exercise: { id: EXERCISE_ID, name: 'Remo Con Barra', weight_mode: 'with_weight' },
    weight_mode: 'with_weight',
    suggested_sets: 3,
    suggested_reps: '[10,10,10]',
    suggested_weights: '[40,40,40]',
    rest_time: null,
    suggested_weight: null,
    ...overrides,
  }
}

function renderCard(props = {}) {
  const onSaveLog = vi.fn().mockResolvedValue(undefined)
  const utils = render(
    <ExerciseCard
      planEx={planEx()}
      log={null}
      onSaveLog={onSaveLog}
      onDeleteLog={vi.fn()}
      suggestedSets={3}
      loggedDate="2026-09-22"
      {...props}
    />
  )
  return { ...utils, onSaveLog }
}

async function expand(user) {
  await user.click(screen.getByText('Remo Con Barra'))
}

describe('vista de confirmación', () => {
  it('al expandir muestra lo prescripto en lectura, sin inputs', async () => {
    const user = userEvent.setup()
    renderCard()
    await expand(user)
    expect(screen.getByText(/lo que te dejó tu coach/i)).toBeInTheDocument()
    // Prescripción uniforme → vista compacta: Series / Reps por serie / Peso por serie
    expect(screen.getByText(/reps por serie/i)).toBeInTheDocument()
    expect(screen.getByText('40 kg')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('40')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lo hice distinto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no lo hice/i })).toBeInTheDocument()
  })
})

describe('lectura de la prescripción como la guarda el armador', () => {
  it('un valor suelto ("5" con 2 series, el caso Molino) va a las dos series y se puede confirmar', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({
      planEx: planEx({
        suggested_sets: 2,
        suggested_reps: '5',
        suggested_weights: '["",""]',
        weight_mode: 'bodyweight',
        exercise: { id: EXERCISE_ID, name: 'Remo Con Barra', weight_mode: 'bodyweight' },
      }),
      suggestedSets: 2,
    })
    await expand(user)
    expect(screen.getByText(/reps por serie/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /PSE 4/i }))
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({
      p_reps: [5, 5],
      p_weights: null,
      p_actual_sets: 2,
      p_entry_mode: 'confirmed',
    })
  })

  it('un array con hueco hereda de la serie anterior', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ planEx: planEx({ suggested_reps: '["10","","12"]' }) })
    await expand(user)
    // 10 / 10 / 12 → diferenciado → tabla por serie, no compacto
    expect(screen.queryByText(/reps por serie/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /PSE 5/i }))
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({ p_reps: [10, 10, 12] })
  })

  it('diferenciado por el coach → tabla por serie, no compacto', async () => {
    const user = userEvent.setup()
    renderCard({
      planEx: planEx({ suggested_reps: '["8","8","6"]', suggested_weights: '["40","45","50"]' }),
    })
    await expand(user)
    expect(screen.queryByText(/reps por serie/i)).not.toBeInTheDocument()
    expect(screen.getByText('40 kg')).toBeInTheDocument()
    expect(screen.getByText('45 kg')).toBeInTheDocument()
    expect(screen.getByText('50 kg')).toBeInTheDocument()
  })
})

describe('CONFIRMAR: el toque sobre el PSE guarda con entry_mode=confirmed', () => {
  it('manda lo prescripto tal cual, el PSE elegido y status=done', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    expect(screen.getByText(/tocá el esfuerzo/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /PSE 7/i }))

    expect(onSaveLog).toHaveBeenCalledTimes(1)
    const [peId, data] = onSaveLog.mock.calls[0]
    expect(peId).toBe('pe-1')
    expect(data).toMatchObject({
      p_reps: [10, 10, 10],
      p_weights: [40, 40, 40],
      p_actual_sets: 3,
      p_perceived_difficulty: 7,
      p_completed: true,
      p_status: 'done',
      p_skip_reason: null,
      p_entry_mode: 'confirmed',
    })
  })

  it('sin peso a la vista NO se puede confirmar: hay que pasar por ajustar', async () => {
    const user = userEvent.setup()
    // El coach no puso kilos y no hay historial → falta el peso.
    renderCard({ planEx: planEx({ suggested_weights: null }) })
    await expand(user)
    expect(screen.queryByRole('button', { name: /lo hice tal cual/i })).not.toBeInTheDocument()
    expect(screen.getByText(/falta el peso/i)).toBeInTheDocument()
    // El botón principal pasa a ser el de registrar a mano (además del
    // círculo del header, que lleva el mismo nombre accesible).
    expect(screen.getAllByRole('button', { name: /registrar entrenamiento/i }).length).toBe(2)
  })
})

describe('prellenado del peso con el último registro', () => {
  const lastLog = {
    id: 'l-old',
    logged_date: '2026-09-18',
    completed: true,
    status: 'done',
    actual_weights_jsonb: [42, 42, 42],
    actual_reps_jsonb: [10, 10, 10],
  }

  it('si el coach no puso kilos, propone lo último cargado y lo dice', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ planEx: planEx({ suggested_weights: null }), lastLog })
    await expand(user)
    expect(screen.getByText('42 kg')).toBeInTheDocument()
    expect(screen.getByText(/lo último que cargaste/i)).toBeInTheDocument()
    // Y se puede confirmar de un toque con esos kilos.
    await user.click(screen.getByRole('button', { name: /lo hice tal cual/i }))
    await user.click(screen.getByRole('button', { name: /PSE 5/i }))
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({ p_weights: [42, 42, 42] })
  })

  it('el peso del coach gana sobre el último registro, y no se avisa procedencia', async () => {
    const user = userEvent.setup()
    renderCard({ lastLog })
    await expand(user)
    expect(screen.getByText('40 kg')).toBeInTheDocument()
    expect(screen.queryByText(/lo último que cargaste/i)).not.toBeInTheDocument()
  })

  it('ignora un último registro con pesos en cero (los 31 logs viejos)', async () => {
    const user = userEvent.setup()
    renderCard({
      planEx: planEx({ suggested_weights: null }),
      lastLog: { ...lastLog, actual_weights_jsonb: [0, 0, 0] },
    })
    await expand(user)
    expect(screen.queryByText('0 kg')).not.toBeInTheDocument()
    expect(screen.getByText(/falta el peso/i)).toBeInTheDocument()
  })

  it('ignora un último registro omitido', async () => {
    const user = userEvent.setup()
    renderCard({
      planEx: planEx({ suggested_weights: null }),
      lastLog: { ...lastLog, completed: false, status: 'skipped', actual_weights_jsonb: null },
    })
    await expand(user)
    expect(screen.getByText(/falta el peso/i)).toBeInTheDocument()
  })
})

describe('AJUSTAR: los campos se abren recién ahí y la serie 1 cascadea', () => {
  it('cambiar la serie 1 arrastra a las series sincronizadas; guarda con entry_mode=edited', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))

    // Tres inputs de reps con 10; cambiar el primero a 8 → los tres en 8.
    const repsInputs = screen.getAllByDisplayValue('10')
    expect(repsInputs).toHaveLength(3)
    await user.clear(repsInputs[0])
    await user.type(repsInputs[0], '8')
    expect(screen.getAllByDisplayValue('8')).toHaveLength(3)

    // PSE y guardar.
    await user.click(screen.getByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: /marcar como completado/i }))
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({
      p_reps: [8, 8, 8],
      p_weights: [40, 40, 40],
      p_entry_mode: 'edited',
      p_status: 'done',
    })
  })

  it('una serie diferenciada por el coach no se pisa', async () => {
    const user = userEvent.setup()
    renderCard({ planEx: planEx({ suggested_reps: '[10,8,6]' }) })
    await expand(user)
    await user.click(screen.getByRole('button', { name: /lo hice distinto/i }))
    const first = screen.getByDisplayValue('10')
    await user.clear(first)
    await user.type(first, '9')
    expect(screen.getByDisplayValue('9')).toBeInTheDocument()
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
    expect(screen.getByDisplayValue('6')).toBeInTheDocument()
  })
})

describe('NO LO HICE: el motivo guarda un omitido sin datos de ejecución', () => {
  it('manda status=skipped, el motivo, completed=false y todo lo demás en null', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard()
    await expand(user)
    await user.click(screen.getByRole('button', { name: /no lo hice/i }))
    expect(screen.getByText(/por qué no lo hiciste/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /no llegué con el tiempo/i }))

    expect(onSaveLog).toHaveBeenCalledTimes(1)
    const data = onSaveLog.mock.calls[0][1]
    expect(data).toMatchObject({
      p_reps: null,
      p_weights: null,
      p_actual_sets: null,
      p_perceived_difficulty: null,
      p_completed: false,
      p_status: 'skipped',
      p_skip_reason: 'time',
      p_entry_mode: null,
    })
  })

  it('un log omitido se muestra como tal, con el motivo, y permite cambiar', async () => {
    const user = userEvent.setup()
    renderCard({
      log: { id: 'l1', completed: false, status: 'skipped', skip_reason: 'discomfort' },
    })
    // Colapsado: la línea de resumen.
    expect(screen.getByText(/no lo hiciste/i)).toBeInTheDocument()
    expect(screen.getByText(/me molestaba algo/i)).toBeInTheDocument()
    await expand(user)
    // "Cambiar" vuelve a la vista de confirmación con las tres salidas.
    await user.click(screen.getByRole('button', { name: /cambiar/i }))
    expect(screen.getByRole('button', { name: /lo hice tal cual/i })).toBeInTheDocument()
  })
})

describe('modo coach: misma tarjeta, tercera persona', () => {
  it('los tres botones y el título hablan de la persona, y el payload es idéntico', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ coachMode: true })
    await expand(user)
    expect(screen.getByText(/lo que le dejaste/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lo hizo distinto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^no lo hizo$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lo hice tal cual/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lo hizo tal cual/i }))
    expect(screen.getByText(/cómo le resultó/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /PSE 6/i }))
    // El payload no sabe de la voz: source lo deriva la RPC del usuario logueado.
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({
      p_reps: [10, 10, 10],
      p_entry_mode: 'confirmed',
      p_status: 'done',
    })
    expect(onSaveLog.mock.calls[0][1]).not.toHaveProperty('p_source')
  })

  it('los motivos de omisión también van en tercera persona', async () => {
    const user = userEvent.setup()
    const { onSaveLog } = renderCard({ coachMode: true })
    await expand(user)
    await user.click(screen.getByRole('button', { name: /^no lo hizo$/i }))
    expect(screen.getByText(/por qué no lo hizo/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /no llegó con el tiempo/i }))
    expect(onSaveLog.mock.calls[0][1]).toMatchObject({ p_status: 'skipped', p_skip_reason: 'time' })
  })

  it('la procedencia del peso se lee desde la coach', async () => {
    const user = userEvent.setup()
    renderCard({
      coachMode: true,
      planEx: planEx({ suggested_weights: null }),
      lastLog: {
        id: 'l-old',
        logged_date: '2026-09-18',
        completed: true,
        status: 'done',
        actual_weights_jsonb: [42, 42, 42],
        actual_reps_jsonb: [10, 10, 10],
      },
    })
    await expand(user)
    expect(screen.getByText(/lo último que cargó/i)).toBeInTheDocument()
    expect(screen.getByText(/no le pusiste kilos/i)).toBeInTheDocument()
  })
})

describe('un log hecho muestra si fue confirmado o ajustado', () => {
  it('badge "tal cual" para entry_mode=confirmed', async () => {
    const user = userEvent.setup()
    renderCard({
      log: {
        id: 'l1',
        completed: true,
        status: 'done',
        entry_mode: 'confirmed',
        actual_sets: 3,
        actual_reps_jsonb: [10, 10, 10],
        actual_weights_jsonb: [40, 40, 40],
        perceived_difficulty: 7,
      },
    })
    await expand(user)
    const summary = screen.getByText(/completado/i).closest('div')
    expect(within(summary).getByText(/tal cual/i)).toBeInTheDocument()
  })
})
