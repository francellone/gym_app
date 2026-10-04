import { describe, it, expect } from 'vitest'
import {
  buildNoteThread,
  pickNotePreview,
  groupNoteThreads,
  attachNoteThreads,
} from './notePreview'

const n = (id, role, body, at, extra = {}) => ({
  id,
  context_id: 'log1',
  author_role: role,
  body,
  created_at: at,
  visibility: 'shared',
  ...extra,
})

// Caso real: la persona escribe, la coach responde.
const resbalo = [
  n('a', 'coach', 'no hace falta bajar tanto', '2026-09-02T06:50:00Z'),
  n('b', 'student', 'Me resbalo', '2026-08-31T19:48:00Z'),
]

describe('pickNotePreview — se ve primero la nota del otro', () => {
  it('la coach ve la de la persona aunque la suya sea más nueva', () => {
    const p = pickNotePreview(buildNoteThread(resbalo, 'coach'))
    expect(p).toEqual({ body: 'Me resbalo', authorRole: 'student', mine: false, total: 2 })
  })

  it('la persona ve la de la coach', () => {
    const p = pickNotePreview(buildNoteThread(resbalo, 'student'))
    expect(p.body).toBe('no hace falta bajar tanto')
    expect(p.mine).toBe(false)
  })

  it('si el otro no escribió, se ve la última propia', () => {
    const notes = [
      n('a', 'coach', 'primera', '2026-09-01T10:00:00Z'),
      n('b', 'coach', 'segunda', '2026-09-02T10:00:00Z'),
    ]
    const p = pickNotePreview(buildNoteThread(notes, 'coach'))
    expect(p).toEqual({ body: 'segunda', authorRole: 'coach', mine: true, total: 2 })
  })

  it('con varias del otro, la última de ellas', () => {
    const notes = [
      n('a', 'student', 'vieja', '2026-09-01T10:00:00Z'),
      n('b', 'coach', 'respuesta', '2026-09-02T10:00:00Z'),
      n('c', 'student', 'nueva', '2026-09-03T10:00:00Z'),
    ]
    expect(pickNotePreview(buildNoteThread(notes, 'coach')).body).toBe('nueva')
  })

  it('sin notas devuelve null', () => {
    expect(pickNotePreview([])).toBeNull()
  })
})

describe('buildNoteThread', () => {
  it('ordena de la más vieja a la más nueva y marca las propias', () => {
    const t = buildNoteThread(resbalo, 'coach')
    expect(t.map((x) => [x.body, x.mine])).toEqual([
      ['Me resbalo', false],
      ['no hace falta bajar tanto', true],
    ])
  })

  it('saca borradas, vacías y, para la persona, las privadas de la coach', () => {
    const notes = [
      ...resbalo,
      n('c', 'coach', 'borrada', '2026-09-03T00:00:00Z', { deleted_at: '2026-09-04' }),
      n('d', 'coach', '   ', '2026-09-03T00:00:00Z'),
      n('e', 'coach', 'privada', '2026-09-03T00:00:00Z', { visibility: 'coach_private' }),
    ]
    expect(buildNoteThread(notes, 'student')).toHaveLength(2)
    expect(buildNoteThread(notes, 'coach')).toHaveLength(3)
  })
})

describe('groupNoteThreads + attachNoteThreads', () => {
  it('pega conversación y preview a cada registro; los sin notas quedan vacíos', () => {
    const map = groupNoteThreads(resbalo, 'coach')
    const rows = attachNoteThreads([{ id: 'log1' }, { id: 'log2', notes: '' }], map)
    expect(rows[0].notes).toBe('Me resbalo')
    expect(rows[0].notePreview.total).toBe(2)
    expect(rows[0].noteThread).toHaveLength(2)
    expect(rows[1].notePreview).toBeNull()
    expect(rows[1].noteThread).toEqual([])
  })
})
