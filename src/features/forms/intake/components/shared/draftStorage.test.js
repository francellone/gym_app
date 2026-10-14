import { describe, expect, it, beforeEach } from 'vitest'
import {
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
  pickInitialResponses,
} from './draftStorage'

describe('borrador local del formulario', () => {
  beforeEach(() => localStorage.clear())

  it('guarda y recupera por asignación', () => {
    writeLocalDraft('a1', { q1: 'hola' })
    expect(readLocalDraft('a1')).toEqual({ q1: 'hola' })
    expect(readLocalDraft('a2')).toBeNull()
  })

  it('respuestas vacías borran el borrador', () => {
    writeLocalDraft('a1', { q1: 'hola' })
    writeLocalDraft('a1', {})
    expect(readLocalDraft('a1')).toBeNull()
  })

  it('clear lo borra y tolera datos rotos', () => {
    writeLocalDraft('a1', { q1: 'x' })
    clearLocalDraft('a1')
    expect(readLocalDraft('a1')).toBeNull()
    localStorage.setItem('gymcoach_form_draft_a1', '{no es json')
    expect(readLocalDraft('a1')).toBeNull()
  })

  it('arranca con la versión más completa', () => {
    expect(pickInitialResponses({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
    expect(pickInitialResponses({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1, b: 2 })
    expect(pickInitialResponses({ a: 'local' }, { a: 'base' })).toEqual({ a: 'local' })
    expect(pickInitialResponses(null, { b: '' })).toEqual({})
    expect(pickInitialResponses(null, null)).toEqual({})
  })
})
