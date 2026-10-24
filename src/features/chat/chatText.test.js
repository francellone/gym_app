import { describe, it, expect } from 'vitest'
import { contextLabel } from './chatText'

const t = (k, o = {}) => `${k}${Object.keys(o).length ? JSON.stringify(o) : ''}`
const labels = {
  exercises: new Map(),
  plans: new Map(),
  planExercises: new Map(),
  logs: new Map(),
  blockLogs: new Map(),
}
const fmt = (d) => d.split('-').reverse().slice(0, 2).join('/')

describe('contextLabel (v78)', () => {
  it('observación del día: día y fecha entrenada', () => {
    const label = contextLabel(
      t,
      { context_type: 'session_day', plan_section: 'day_b', note_date: '2026-10-20' },
      labels,
      fmt
    )
    expect(label).toBe('chat.dayShort{"day":"B"} · chat.context.trainedOn{"date":"20/10"}')
  })
  it('respuesta a un evento: el título del evento', () => {
    const l = { ...labels, eventLabel: (id) => (id === 'e1' ? 'Completó la semana' : null) }
    expect(contextLabel(t, { context_type: 'chat_event', chat_event_id: 'e1' }, l, fmt)).toBe(
      'Completó la semana'
    )
    expect(contextLabel(t, { context_type: 'chat_event', chat_event_id: 'zz' }, l, fmt)).toBe(
      'chat.context.event'
    )
  })
})
