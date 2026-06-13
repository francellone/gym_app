import { describe, it, expect } from 'vitest'
import { diffPrescription } from './prescriptionHistory'

describe('diffPrescription (doc 48)', () => {
  it('sin cambios → null', () => {
    const row = {
      suggested_sets: 4,
      suggested_reps: '["6","4","4","4"]',
      suggested_weights: '["30","40","40","40"]',
      suggested_weight: '30',
      rest_time: '2MIN',
      suggested_pse: 'Muy duro (7-9)',
    }
    expect(diffPrescription(row, { ...row })).toBeNull()
  })

  it('detecta cambio de peso por serie', () => {
    const orig = { suggested_weights: '["30","40","40","40"]', suggested_weight: '30' }
    const next = { suggested_weights: '["35","40","40","40"]', suggested_weight: '35' }
    const d = diffPrescription(orig, next)
    expect(d.weight).toEqual({ old: '30, 40, 40, 40', new: '35, 40, 40, 40' })
  })

  it('detecta cambio de reps', () => {
    const orig = { suggested_reps: '["6","4","4","4"]' }
    const next = { suggested_reps: '["8","4","4","4"]' }
    expect(diffPrescription(orig, next).reps).toEqual({ old: '6, 4, 4, 4', new: '8, 4, 4, 4' })
  })

  it('detecta cambio de series', () => {
    expect(diffPrescription({ suggested_sets: 4 }, { suggested_sets: 5 }).sets).toEqual({
      old: '4',
      new: '5',
    })
  })

  it('NO marca falso positivo cuando el peso pasa de null a array vacío serializado', () => {
    // ejercicio sin carga: al re-guardar, suggested_weights se serializa como
    // '["",""]' (displayReps → ", "). No debe contar como cambio.
    const orig = { suggested_weights: null, suggested_weight: null }
    const next = { suggested_weights: '["",""]', suggested_weight: null }
    expect(diffPrescription(orig, next)).toBeNull()
  })

  it('sí registra cuando se saca un peso real (40 → vacío)', () => {
    const orig = { suggested_weights: '["40","40"]', suggested_weight: '40' }
    const next = { suggested_weights: '["",""]', suggested_weight: null }
    expect(diffPrescription(orig, next).weight).toEqual({ old: '40, 40', new: '—' })
  })
})
