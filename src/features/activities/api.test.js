// ============================================================
// activities/api — tests de helpers puros (catálogo, validación,
// armado de payload). El acceso a Supabase no se mockea acá; se
// valida con browser francellone (RLS) como dice el doc 55.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_TYPES,
  requiresLabel,
  getActivityTypeMeta,
  validateActivityDraft,
  buildActivityPayload,
} from './api'

describe('catálogo ACTIVITY_TYPES', () => {
  it('tiene los 9 tipos del enum activity_type', () => {
    expect(ACTIVITY_TYPES.map((t) => t.key)).toEqual([
      'football',
      'yoga',
      'running',
      'swimming',
      'cycling',
      'pilates',
      'hiking',
      'sport_other',
      'other',
    ])
  })
  it('cada tipo trae i18n y emoji', () => {
    for (const t of ACTIVITY_TYPES) {
      expect(t.i18n).toMatch(/^activities\.types\./)
      expect(t.emoji).toBeTruthy()
    }
  })
})

describe('requiresLabel', () => {
  it('sport_other y other exigen label', () => {
    expect(requiresLabel('sport_other')).toBe(true)
    expect(requiresLabel('other')).toBe(true)
  })
  it('los tipos del catálogo no exigen label', () => {
    expect(requiresLabel('football')).toBe(false)
    expect(requiresLabel('yoga')).toBe(false)
  })
})

describe('getActivityTypeMeta', () => {
  it('devuelve la meta del tipo', () => {
    expect(getActivityTypeMeta('yoga')?.emoji).toBe('🧘')
  })
  it('null para tipo desconocido', () => {
    expect(getActivityTypeMeta('nope')).toBeNull()
  })
})

describe('validateActivityDraft', () => {
  it('exige tipo', () => {
    expect(validateActivityDraft({})).toBe('activities.errors.typeRequired')
  })
  it('rechaza tipo inválido', () => {
    expect(validateActivityDraft({ activity_type: 'xx' })).toBe('activities.errors.typeInvalid')
  })
  it('exige label en other sin texto', () => {
    expect(validateActivityDraft({ activity_type: 'other', label: '  ' })).toBe(
      'activities.errors.labelRequired'
    )
  })
  it('acepta other con texto', () => {
    expect(validateActivityDraft({ activity_type: 'other', label: 'Escalada' })).toBeNull()
  })
  it('acepta tipo del catálogo sin label', () => {
    expect(validateActivityDraft({ activity_type: 'football' })).toBeNull()
  })
  it('valida rango de duración', () => {
    expect(validateActivityDraft({ activity_type: 'yoga', duration_min: 0 })).toBe(
      'activities.errors.durationRange'
    )
    expect(validateActivityDraft({ activity_type: 'yoga', duration_min: 5000 })).toBe(
      'activities.errors.durationRange'
    )
    expect(validateActivityDraft({ activity_type: 'yoga', duration_min: 60 })).toBeNull()
  })
  it('valida rango de intensidad', () => {
    expect(validateActivityDraft({ activity_type: 'yoga', intensity: 11 })).toBe(
      'activities.errors.intensityRange'
    )
    expect(validateActivityDraft({ activity_type: 'yoga', intensity: 7 })).toBeNull()
  })
})

describe('buildActivityPayload', () => {
  const base = {
    studentId: 'student-1',
    userId: 'student-1',
    date: '2026-06-30',
  }

  it('arma la fila con defaults de source=student', () => {
    const row = buildActivityPayload({
      ...base,
      draft: { activity_type: 'football' },
    })
    expect(row).toMatchObject({
      student_id: 'student-1',
      date: '2026-06-30',
      activity_type: 'football',
      label: null,
      duration_min: null,
      intensity: null,
      notes: null,
      source: 'student',
      created_by: 'student-1',
    })
  })

  it('trimea label y notas; convierte numéricos', () => {
    const row = buildActivityPayload({
      ...base,
      draft: {
        activity_type: 'other',
        label: '  Escalada ',
        duration_min: '90',
        intensity: '8',
        notes: '  con amigos ',
      },
    })
    expect(row.label).toBe('Escalada')
    expect(row.duration_min).toBe(90)
    expect(row.intensity).toBe(8)
    expect(row.notes).toBe('con amigos')
  })

  it("'' numérico se normaliza a null", () => {
    const row = buildActivityPayload({
      ...base,
      draft: { activity_type: 'yoga', duration_min: '', intensity: '' },
    })
    expect(row.duration_min).toBeNull()
    expect(row.intensity).toBeNull()
  })

  it('source=coach cuando lo carga el coach', () => {
    const row = buildActivityPayload({
      ...base,
      userId: 'coach-1',
      source: 'coach',
      draft: { activity_type: 'running' },
    })
    expect(row.source).toBe('coach')
    expect(row.created_by).toBe('coach-1')
  })
})
