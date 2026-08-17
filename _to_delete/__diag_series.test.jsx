import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import StrengthBlockEditor from './StrengthBlockEditor'

const EXERCISES = [
  { id: 'ex-sent', name: 'Sentadilla' },
  { id: 'ex-remo', name: 'Remo' },
  { id: 'ex-press', name: 'Press' },
]

function mkRow(id, letter, number, sets) {
  return {
    id,
    exercise_id: 'ex-sent',
    block_letter: letter,
    block_number: number,
    suggested_sets: sets,
    suggested_reps_array: ['10'],
    suggested_weights_array: ['20'],
    suggested_weight: '',
    rest_time: '90',
    suggested_pse: '',
    extra_notes: '',
    video_url: '',
    order_index: 0,
    weight_mode: null,
    unilateral: null,
  }
}

let latest = null

function Harness({ initial }) {
  const [block, setBlock] = useState({ block_type: 'strength', section: 'day_a', exercises: initial })
  latest = block.exercises
  return (
    <StrengthBlockEditor
      block={block}
      exercises={EXERCISES}
      onUpdateExercises={(next) => setBlock((b) => ({ ...b, exercises: next }))}
    />
  )
}

function setsInputs() {
  return screen.getAllByPlaceholderText('3')
}

function expandAll() {
  // Las filas pueden venir colapsadas: abrir todas si hay toggles
  const btns = screen.queryAllByRole('button')
  btns.forEach((b) => {
    if (/expandir|abrir|▸/i.test(b.textContent || '')) fireEvent.click(b)
  })
}

describe('DIAG: editar series de un ejercicio del bloque', () => {
  it('A) cambiar las series de A1 no toca A2 ni A3', () => {
    render(<Harness initial={[mkRow('a', 'A', '1', '3'), mkRow('b', 'A', '2', '3'), mkRow('c', 'A', '3', '3')]} />)
    expandAll()
    const inputs = setsInputs()
    expect(inputs.length).toBe(3)
    fireEvent.change(inputs[0], { target: { value: '4' } })
    expect(latest.map((e) => e.suggested_sets)).toEqual(['4', '3', '3'])
  })

  it('B) dos cambios en el MISMO tick (filas distintas): se pierde alguno?', () => {
    render(<Harness initial={[mkRow('a', 'A', '1', '3'), mkRow('b', 'A', '2', '3'), mkRow('c', 'A', '3', '3')]} />)
    expandAll()
    const inputs = setsInputs()
    act(() => {
      fireEvent.change(inputs[0], { target: { value: '4' } })
      fireEvent.change(inputs[1], { target: { value: '5' } })
    })
    // eslint-disable-next-line no-console
    console.log('RESULTADO B:', JSON.stringify(latest.map((e) => e.suggested_sets)))
    expect(latest.map((e) => e.suggested_sets)).toEqual(['4', '5', '3'])
  })

  it('C) tipear rapido en la misma fila (3 -> 1 -> 12)', () => {
    render(<Harness initial={[mkRow('a', 'A', '1', '3'), mkRow('b', 'A', '2', '3')]} />)
    const inputs = setsInputs()
    act(() => {
      fireEvent.change(inputs[0], { target: { value: '1' } })
      fireEvent.change(inputs[0], { target: { value: '12' } })
    })
    // eslint-disable-next-line no-console
    console.log('RESULTADO C:', JSON.stringify(latest.map((e) => e.suggested_sets)))
    expect(latest[0].suggested_sets).toBe('12')
  })

  it('D) cambiar la letra de A2 a B y de vuelta a A: que numero queda?', () => {
    render(<Harness initial={[mkRow('a', 'A', '1', '3'), mkRow('b', 'A', '2', '3'), mkRow('c', 'A', '3', '3')]} />)
    const selects = screen.getAllByRole('combobox')
    // el select de "Bloque" de la 2da fila: buscamos por value actual
    const letterSelects = selects.filter((s) => s.previousSibling?.textContent === 'Bloque' || s.parentElement?.textContent?.startsWith('Bloque'))
    fireEvent.change(letterSelects[1], { target: { value: 'B' } })
    fireEvent.change(letterSelects[1], { target: { value: 'A' } })
    // eslint-disable-next-line no-console
    console.log('RESULTADO D:', JSON.stringify(latest.map((e) => e.block_letter + e.block_number + ':' + e.suggested_sets)))
    expect(latest[1].block_number).toBe('2')
  })
})
