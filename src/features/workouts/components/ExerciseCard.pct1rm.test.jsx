/**
 * %RM en la vista de la alumna: los kilos se DERIVAN de su 1RM (1RM × %) y
 * son los que prellenan el input de peso. Es la parte más delicada de la
 * función: si el resolvedor se equivoca, la persona carga el peso equivocado.
 *
 * Sin evaluación de 1RM la degradación tiene que ser limpia: se muestra el
 * porcentaje y NUNCA un número inventado.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExerciseCard from './ExerciseCard'

const EXERCISE_ID = 'ex-sentadilla'

function planEx(overrides = {}) {
  return {
    id: 'pe-1',
    exercise_id: EXERCISE_ID,
    exercise: { id: EXERCISE_ID, name: 'Sentadilla Con Barra' },
    weight_mode: 'pct_1rm',
    pct_1rm: 70,
    suggested_sets: 3,
    suggested_reps: '[10,10,10]',
    rest_time: null,
    suggested_weight: null,
    suggested_weights: null,
    ...overrides,
  }
}

// Su máximo de sentadilla: 60 kg, evaluado el 10 de marzo.
function oneRmMap() {
  return new Map([[EXERCISE_ID, { oneRm: 60, date: '2026-03-10', source: 'exercise_eval' }]])
}

function renderCard(props = {}) {
  return render(
    <ExerciseCard
      planEx={planEx()}
      log={null}
      onSaveLog={vi.fn()}
      onDeleteLog={vi.fn()}
      suggestedSets={3}
      loggedDate="2026-08-29"
      {...props}
    />
  )
}

describe('ExerciseCard — peso prescripto por % del máximo', () => {
  it('muestra los kilos derivados: 70% de 60 kg = 42 kg', () => {
    renderCard({ oneRmMap: oneRmMap() })
    expect(screen.getByText(/42 kg/)).toBeInTheDocument()
    // El 70% aparece dos veces: en la línea de "sugerido" y en la explicación.
    expect(screen.getAllByText(/70%/).length).toBeGreaterThan(0)
  })

  it('explica de dónde salieron esos kilos, con la fecha de la evaluación', () => {
    renderCard({ oneRmMap: oneRmMap() })
    // "70% de tu máximo de 60 kg · evaluado el 10 mar"
    expect(screen.getByText(/de tu máximo de 60 kg/)).toBeInTheDocument()
    expect(screen.getByText(/mar/)).toBeInTheDocument()
  })

  it('los kilos derivados prellenan el input de peso (son la prescripción)', async () => {
    const user = userEvent.setup()
    renderCard({ oneRmMap: oneRmMap() })
    await user.click(screen.getByText('Sentadilla Con Barra'))
    expect(screen.getAllByDisplayValue('42').length).toBeGreaterThan(0)
  })

  it('sin evaluación: muestra el porcentaje y NO inventa un peso', () => {
    renderCard({ oneRmMap: new Map() })
    expect(screen.getAllByText(/70%/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/42 kg/)).not.toBeInTheDocument()
    expect(screen.getByText(/no tenés una evaluación de este ejercicio/i)).toBeInTheDocument()
  })

  it('sin mapa de 1RM (no cargó todavía) tampoco inventa nada', () => {
    renderCard()
    expect(screen.getAllByText(/70%/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/42 kg/)).not.toBeInTheDocument()
  })

  it('un ejercicio en kilos no se ve afectado por el mapa de 1RM', () => {
    renderCard({
      planEx: planEx({ weight_mode: 'with_weight', pct_1rm: null, suggested_weight: '50' }),
      oneRmMap: oneRmMap(),
    })
    expect(screen.getByText(/50/)).toBeInTheDocument()
    expect(screen.queryByText(/de tu máximo/)).not.toBeInTheDocument()
  })

  it('si el máximo sube, sube el peso prescripto (auto-progresión, sin tocar el plan)', () => {
    const { unmount } = renderCard({ oneRmMap: oneRmMap() })
    expect(screen.getByText(/42 kg/)).toBeInTheDocument()
    unmount()

    // Misma prescripción (70%), nueva evaluación: 80 kg → 56 kg.
    renderCard({
      oneRmMap: new Map([
        [EXERCISE_ID, { oneRm: 80, date: '2026-08-01', source: 'exercise_eval' }],
      ]),
    })
    expect(screen.getByText(/56 kg/)).toBeInTheDocument()
  })
})
