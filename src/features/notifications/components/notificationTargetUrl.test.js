import { describe, it, expect } from 'vitest'
import { getNotificationTargetUrl } from './NotificationBell'

// Fija el mapa de navegación de notificaciones (B2 + audit 2026-05-30).
// Los bugs de navegación son silenciosos, así que cada tipo queda anclado.
describe('getNotificationTargetUrl', () => {
  const STUDENT = 'stu-123'
  const PLAN = 'plan-456'

  it('coach_comment → panel de notas del alumno', () => {
    expect(getNotificationTargetUrl({ type: 'coach_comment', data: {} })).toBe('/student/notes')
  })

  it('plan_assigned de entrenamiento → workout de hoy', () => {
    expect(
      getNotificationTargetUrl({
        type: 'plan_assigned',
        data: { plan_id: PLAN, plan_type: 'training' },
      })
    ).toBe('/student/workout')
  })

  it('plan_assigned de evaluación → abre esa evaluación', () => {
    expect(
      getNotificationTargetUrl({
        type: 'plan_assigned',
        data: { plan_id: PLAN, plan_type: 'evaluation' },
      })
    ).toBe(`/student/eval/${PLAN}`)
  })

  it('plan_updated de evaluación → abre esa evaluación', () => {
    expect(
      getNotificationTargetUrl({
        type: 'plan_updated',
        data: { plan_id: PLAN, plan_type: 'evaluation' },
      })
    ).toBe(`/student/eval/${PLAN}`)
  })

  it('plan_assigned sin plan_type resuelto → fallback a workout', () => {
    expect(getNotificationTargetUrl({ type: 'plan_assigned', data: { plan_id: PLAN } })).toBe(
      '/student/workout'
    )
  })

  it('weekly_summary → progreso del alumno', () => {
    expect(getNotificationTargetUrl({ type: 'weekly_summary', data: {} })).toBe('/student/progress')
  })

  it('student_note → perfil del alumno tab notas (coach)', () => {
    expect(getNotificationTargetUrl({ type: 'student_note', data: { student_id: STUDENT } })).toBe(
      `/coach/students/${STUDENT}?tab=notas`
    )
  })

  it('profile_change → perfil del alumno tab historial (coach)', () => {
    expect(
      getNotificationTargetUrl({ type: 'profile_change', data: { student_id: STUDENT } })
    ).toBe(`/coach/students/${STUDENT}?tab=history`)
  })

  it('activity_update → perfil del alumno (coach)', () => {
    expect(
      getNotificationTargetUrl({ type: 'activity_update', data: { student_id: STUDENT } })
    ).toBe(`/coach/students/${STUDENT}`)
  })

  it('session_completed → perfil del alumno (coach)', () => {
    expect(
      getNotificationTargetUrl({ type: 'session_completed', data: { student_id: STUDENT } })
    ).toBe(`/coach/students/${STUDENT}`)
  })

  it('stagnation_alert → perfil del alumno tab progreso (coach)', () => {
    expect(
      getNotificationTargetUrl({ type: 'stagnation_alert', data: { student_id: STUDENT } })
    ).toBe(`/coach/students/${STUDENT}?tab=progress`)
  })

  it('schema_health_alert → sin destino', () => {
    expect(getNotificationTargetUrl({ type: 'schema_health_alert', data: {} })).toBeNull()
  })

  it('tipo coach sin student_id en payload → sin destino', () => {
    expect(getNotificationTargetUrl({ type: 'student_note', data: {} })).toBeNull()
    expect(getNotificationTargetUrl({ type: 'stagnation_alert', data: {} })).toBeNull()
  })

  it('tipo desconocido → sin destino', () => {
    expect(getNotificationTargetUrl({ type: 'algo_nuevo', data: {} })).toBeNull()
  })
})
