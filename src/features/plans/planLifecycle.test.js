import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { planLifecycleMode, planUsageSummary } = await import('./planLifecycle')

const base = {
  is_template: false,
  workout_logs: 0,
  sessions: 0,
  block_logs: 0,
  eval_results: 0,
  eval_responses: 0,
  prescription_history: 0,
  assignments: 0,
  active_assignments: 0,
  students: 0,
  clones: 0,
  clone_active_assignments: 0,
  clone_students: 0,
  child_evaluations: 0,
  total_refs: 0,
}

describe('planLifecycleMode (v47, decisión D4)', () => {
  it('sin nada → se elimina', () => {
    expect(planLifecycleMode(base)).toBe('delete')
  })
  it('con cualquier hecho → se archiva', () => {
    expect(planLifecycleMode({ ...base, workout_logs: 3, total_refs: 3 })).toBe('archive')
    expect(planLifecycleMode({ ...base, is_template: true, clones: 1, total_refs: 1 })).toBe(
      'archive'
    )
  })
  it('con asignación activa → bloqueado, aunque tenga hechos', () => {
    expect(
      planLifecycleMode({ ...base, assignments: 1, active_assignments: 1, total_refs: 1 })
    ).toBe('blocked')
  })
  it('sin uso todavía → null (cargando)', () => {
    expect(planLifecycleMode(null)).toBeNull()
  })
})

describe('planUsageSummary', () => {
  it('plantilla: habla de copias y evaluaciones vinculadas, no de asignaciones directas', () => {
    const partes = planUsageSummary({
      ...base,
      is_template: true,
      clones: 3,
      clone_students: 2,
      child_evaluations: 1,
      total_refs: 4,
    })
    expect(partes).toEqual(['3 copias asignadas a 2 personas', '1 evaluación vinculada'])
  })
  it('clon: asignaciones + registros + evaluaciones', () => {
    const partes = planUsageSummary({
      ...base,
      assignments: 1,
      students: 1,
      workout_logs: 86,
      sessions: 12,
      eval_results: 1,
      eval_responses: 4,
      total_refs: 104,
    })
    expect(partes).toEqual([
      '1 asignación (1 persona)',
      '86 entrenamientos registrados',
      '12 sesiones',
      '5 resultados de evaluación',
    ])
  })
})
