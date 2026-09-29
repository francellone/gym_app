/**
 * Tests de resolveNotificationText — i18n de notificaciones al alumno.
 *
 * Usa la instancia real de i18n (locales es/en reales) para validar que las
 * claves existen y que la resolución respeta el idioma activo del viewer.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '@/i18n'
import { resolveNotificationText } from './resolveNotificationText'

const t = (...args) => i18n.t(...args)

function notif(type, data = {}, overrides = {}) {
  return {
    id: 'n1',
    type,
    title: 'Título guardado en BD',
    body: 'Body guardado en BD',
    data,
    ...overrides,
  }
}

describe('resolveNotificationText — es', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es')
  })

  it('plan_assigned con plan_title (enriquecido client-side)', () => {
    const r = resolveNotificationText(notif('plan_assigned', { plan_title: 'Fuerza 3x' }), t)
    expect(r.title).toBe('¡Nuevo plan asignado!')
    expect(r.body).toBe('Tu coach te asignó el plan "Fuerza 3x".')
  })

  it('plan_assigned sin plan_title → bodyNoTitle', () => {
    const r = resolveNotificationText(notif('plan_assigned', { plan_id: 'x' }), t)
    expect(r.body).toBe('Tu coach te asignó un plan nuevo.')
  })

  it('coach_comment: título traducido, body = texto real del coach', () => {
    const r = resolveNotificationText(
      notif('coach_comment', { note_id: 'a' }, { body: 'Buen trabajo con las sentadillas' }),
      t
    )
    expect(r.title).toBe('Tu coach te dejó una nota')
    expect(r.body).toBe('Buen trabajo con las sentadillas')
  })

  it('weekly_summary del alumno: sesiones, RPE y semana', () => {
    const r = resolveNotificationText(
      notif('weekly_summary', {
        sessions: 3,
        avg_rpe: 7.5,
        week_start: '2026-06-29',
        week_end: '2026-07-05',
      }),
      t
    )
    expect(r.title).toBe('Tu resumen semanal está listo')
    expect(r.body).toContain('3 sesiones')
    expect(r.body).toContain('7.5 RPE promedio')
    expect(r.body).toMatch(/semana del .+ al .+/)
  })

  it('weekly_summary sin RPE → "sin RPE" y singular de sesión', () => {
    const r = resolveNotificationText(
      notif('weekly_summary', {
        sessions: 1,
        avg_rpe: null,
        week_start: '2026-06-29',
        week_end: '2026-07-05',
      }),
      t
    )
    expect(r.body).toContain('1 sesión ·')
    expect(r.body).toContain('sin RPE')
  })

  it('plan_expiring del alumno con plan_title y fecha localizada', () => {
    const r = resolveNotificationText(
      notif('plan_expiring', { plan_title: 'Hipertrofia', end_date: '2026-07-13' }),
      t
    )
    expect(r.title).toBe('Tu plan vence en 7 días')
    expect(r.body).toBe('El plan "Hipertrofia" vence el 13/07/2026.')
  })
})

describe('resolveNotificationText — en', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('plan_assigned se resuelve en inglés (incl. históricas guardadas en español)', () => {
    const r = resolveNotificationText(notif('plan_assigned', { plan_title: 'Strength 3x' }), t)
    expect(r.title).toBe('New plan assigned!')
    expect(r.body).toBe('Your coach assigned you the plan "Strength 3x".')
  })

  it('plan_updated usa plan_title del payload del trigger', () => {
    const r = resolveNotificationText(notif('plan_updated', { plan_title: 'Block 2' }), t)
    expect(r.title).toBe('Your coach updated your plan')
    expect(r.body).toBe('There are changes in "Block 2". Check it out when you can.')
  })

  it('plan_expiring formatea la fecha en formato en', () => {
    const r = resolveNotificationText(
      notif('plan_expiring', { plan_title: 'Cut', end_date: '2026-07-13' }),
      t
    )
    expect(r.body).toBe('The plan "Cut" expires on 07/13/2026.')
  })

  it('weekly_summary plural en inglés', () => {
    const r = resolveNotificationText(
      notif('weekly_summary', {
        sessions: 2,
        avg_rpe: 8,
        week_start: '2026-06-29',
        week_end: '2026-07-05',
      }),
      t
    )
    expect(r.body).toContain('2 sessions')
    expect(r.body).toContain('8 avg RPE')
  })
})

describe('resolveNotificationText — fallback al texto guardado', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('tipos al coach no se resuelven (student_note, profile_change, etc.)', () => {
    for (const type of ['student_note', 'profile_change', 'form_submitted', 'unknown_type']) {
      const r = resolveNotificationText(notif(type, { student_id: 's1' }), t)
      expect(r).toEqual({ title: 'Título guardado en BD', body: 'Body guardado en BD' })
    }
  })

  it('copia del COACH de weekly_summary/plan_expiring (payload con student_name) → fallback', () => {
    for (const type of ['weekly_summary', 'plan_expiring']) {
      const r = resolveNotificationText(
        notif(type, { student_id: 's1', student_name: 'Ana', end_date: '2026-07-13' }),
        t
      )
      expect(r.title).toBe('Título guardado en BD')
    }
  })

  it('weekly_summary con payload incompleto → fallback', () => {
    const r = resolveNotificationText(notif('weekly_summary', {}), t)
    expect(r.title).toBe('Título guardado en BD')
  })

  it('plan_expiring sin end_date → fallback', () => {
    const r = resolveNotificationText(notif('plan_expiring', { plan_title: 'Cut' }), t)
    expect(r.title).toBe('Título guardado en BD')
  })

  it('notificación sin data → no explota', () => {
    const r = resolveNotificationText(notif('plan_assigned', null, { data: null }), t)
    expect(r.title).toBe('New plan assigned!')
    expect(r.body).toBe('Your coach assigned you a new plan.')
  })
})

// v50: el cron pasó a mandar expected_end_date. El payload viejo, con
// end_date, tiene que seguir resolviendo igual.
describe('plan_expiring — payload v50', () => {
  it('usa expected_end_date cuando viene', () => {
    const r = resolveNotificationText(
      notif('plan_expiring', { plan_title: 'Fuerza', expected_end_date: '2026-09-17' }),
      t
    )
    // el idioma queda en el que dejó el bloque anterior: alcanza con que
    // la fecha esté resuelta, no importa el formato local.
    expect(r.body).toMatch(/17.09.2026|09.17.2026/)
  })

  it('sigue resolviendo el payload viejo con end_date', () => {
    const r = resolveNotificationText(
      notif('plan_expiring', { plan_title: 'Fuerza', end_date: '2026-09-17' }),
      t
    )
    expect(r.body).toMatch(/17.09.2026|09.17.2026/)
  })
})

// v59 — dirigido a la coach, resuelto por payload en su idioma
describe('exercise_unclear', () => {
  const data = {
    student_id: 's1',
    student_name: 'Franco Cellone',
    date: '2026-09-28',
    item_name: 'Sumo walk (diagonal)',
    skip_note: null,
  }

  it('es, sin nota', async () => {
    await i18n.changeLanguage('es')
    expect(resolveNotificationText(notif('exercise_unclear', data), t)).toEqual({
      title: 'Franco Cellone no supo cómo hacer un ejercicio',
      body: 'Sumo walk (diagonal) (28/09/2026)',
    })
  })

  it('en, con nota', async () => {
    await i18n.changeLanguage('en')
    const r = resolveNotificationText(
      notif('exercise_unclear', { ...data, skip_note: 'no había video' }),
      t
    )
    expect(r.title).toBe("Franco Cellone didn't know how to do an exercise")
    expect(r.body).toContain('no había video')
    await i18n.changeLanguage('es')
  })

  it('payload sin fecha → texto guardado', () => {
    const r = resolveNotificationText(notif('exercise_unclear', { student_name: 'X' }), t)
    expect(r.title).toBe('Título guardado en BD')
  })
})

describe('v65 — vínculo persona ↔ coach', () => {
  it('a la coach, con el nombre de quien pide', async () => {
    const { default: i18n } = await import('@/i18n')
    const t = i18n.getFixedT('es')
    const r = resolveNotificationText(
      { type: 'coach_link_request', title: 'x', body: 'y', data: { student_name: 'Ana' } },
      t
    )
    expect(r.title).toBe('Ana quiere sumarse')
  })

  it('a la persona, en su idioma', async () => {
    const { default: i18n } = await import('@/i18n')
    const t = i18n.getFixedT('en')
    const r = resolveNotificationText(
      { type: 'coach_link_accepted', title: 'x', body: 'y', data: { coach_name: 'Anto' } },
      t
    )
    expect(r.title).toBe('Anto accepted your request')
  })
})
