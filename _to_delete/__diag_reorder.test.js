import { reorderByBlockmate, inheritFromFirstBlockmate } from './helpers'

const r = (name, letter, number, sets) => ({
  name, block_letter: letter, block_number: number, suggested_sets: sets,
})

describe('DIAG reorder / herencia', () => {
  it('E) reordenar despues de un salto de numeracion (A1, A4, A3)', () => {
    const list = [r('Sentadilla', 'A', '1', '3'), r('Remo', 'A', '4', '3'), r('Press', 'A', '3', '2')]
    const out = reorderByBlockmate(list)
    console.log('E:', JSON.stringify(out.map((e) => `${e.name}=${e.block_letter}${e.block_number}/${e.suggested_sets}s`)))
  })

  it('F) dos ejercicios con el MISMO sub-numero (A2, A2) + reordenar', () => {
    const list = [r('Sentadilla', 'A', '1', '3'), r('Remo', 'A', '2', '3'), r('Press', 'A', '2', '1')]
    const out = reorderByBlockmate(list)
    console.log('F:', JSON.stringify(out.map((e) => `${e.name}=${e.block_letter}${e.block_number}/${e.suggested_sets}s`)))
  })

  it('G) cambiar la letra de un ejercicio con series VACIAS: hereda?', () => {
    const list = [r('Sentadilla', 'A', '1', '3'), r('Remo', 'A', '2', '3'), r('Press', '', '', '')]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 2, letter: 'A' })
    console.log('G:', JSON.stringify(patches))
  })

  it('H) cambiar la letra de un ejercicio que YA tenia series propias', () => {
    const list = [r('Sentadilla', 'A', '1', '3'), r('Remo', 'A', '2', '3'), r('Press', 'B', '1', '5')]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 2, letter: 'A' })
    console.log('H:', JSON.stringify(patches))
  })

  it('I) ejercicios SIN letra intercalados + reordenar', () => {
    const list = [r('Sentadilla', 'A', '1', '3'), r('Movilidad', '', '', '2'), r('Remo', 'A', '2', '3'), r('Press', 'B', '1', '4')]
    const out = reorderByBlockmate(list)
    console.log('I:', JSON.stringify(out.map((e) => `${e.name}=${e.block_letter}${e.block_number}/${e.suggested_sets}s`)))
  })
})
