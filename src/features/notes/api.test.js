// ============================================================
// notes/api — tests de la data layer del panel de notas
// ------------------------------------------------------------
// Foco: createNote, porque es el único método con validación rica
// del lado del cliente (body vacío, contextType='free' nulifica
// context_id, coach_private rechaza student, denormalización de
// muscle_group/note_date sólo cuando contextType='free').
//
// Mockeo @/lib/supabase con el factory de src/test/mocks/supabase.
// Decisión: NO se testean los getOrCreateThread / listNotes / etc
// porque son passthrough sin lógica. Si en el futuro acumulan
// validación cliente, sumar tests acá.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

// Import DESPUÉS del mock para que el módulo use la versión mockeada
const { createNote } = await import('./api')

describe('createNote — validaciones cliente', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    // El default del chain insert().select().single() devuelve { data: null, error: null }.
    // Acá lo configuramos para devolver una nota "creada" en el camino feliz.
    supabaseMock._chain.single.mockResolvedValue({
      data: { id: 'note-fake', body: 'hola' },
      error: null,
    })
  })

  it('rechaza sin threadId/authorId/authorRole sin pegarle a la DB', async () => {
    const { data, error } = await createNote({ body: 'algo' })
    expect(data).toBeNull()
    expect(error.code).toBe('INVALID_INPUT')
    expect(error.message).toMatch(/obligatorios/i)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('rechaza body vacío o sólo whitespace', async () => {
    const base = { threadId: 't1', authorId: 'u1', authorRole: 'student' }

    for (const body of ['', '   ', '\n\t', null, undefined]) {
      const { data, error } = await createNote({ ...base, body })
      expect(data).toBeNull()
      expect(error.code).toBe('INVALID_INPUT')
      expect(error.message).toMatch(/vacía/i)
    }
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('rechaza coach_private cuando el autor es student', async () => {
    const { data, error } = await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'secret',
      visibility: 'coach_private',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('FORBIDDEN')
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('contextType="free" nulifica context_id aunque venga un valor', async () => {
    await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'comentario libre',
      contextType: 'free',
      contextId: 'should-be-ignored',
    })

    expect(supabaseMock.from).toHaveBeenCalledWith('notes')
    const insertCall = supabaseMock._chain.insert.mock.calls[0][0]
    expect(insertCall).toMatchObject({
      thread_id: 't1',
      author_id: 'u1',
      author_role: 'student',
      body: 'comentario libre',
      visibility: 'shared',
      context_type: 'free',
      context_id: null, // <-- la pieza clave
      parent_note_id: null,
      tags: [],
    })
  })

  it('contextType="workout_log" preserva context_id', async () => {
    await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'sobre el log',
      contextType: 'workout_log',
      contextId: 'log-abc',
    })

    const insertCall = supabaseMock._chain.insert.mock.calls[0][0]
    expect(insertCall.context_type).toBe('workout_log')
    expect(insertCall.context_id).toBe('log-abc')
  })

  it('muscleGroup sólo se manda cuando contextType="free"', async () => {
    // En "free" con muscle_group → se manda
    await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'piernas',
      contextType: 'free',
      muscleGroup: 'piernas',
    })
    const call1 = supabaseMock._chain.insert.mock.calls[0][0]
    expect(call1.muscle_group).toBe('piernas')

    resetSupabaseMock(supabaseMock)
    supabaseMock._chain.single.mockResolvedValue({ data: { id: 'n2' }, error: null })

    // En "workout_log" con muscle_group → NO se manda (el trigger lo pisa)
    await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'algo',
      contextType: 'workout_log',
      contextId: 'log-x',
      muscleGroup: 'piernas',
    })
    const call2 = supabaseMock._chain.insert.mock.calls[0][0]
    expect(call2).not.toHaveProperty('muscle_group')
  })

  it('mapea error 42501 a FORBIDDEN con mensaje friendly', async () => {
    supabaseMock._chain.single.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'rls violation' },
    })

    const { data, error } = await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'algo',
    })
    expect(data).toBeNull()
    expect(error.code).toBe('FORBIDDEN')
    expect(error.message).toMatch(/no tenés permiso/i)
  })

  it('camino feliz devuelve la fila creada', async () => {
    const fakeRow = { id: 'note-1', body: 'hola', thread_id: 't1' }
    supabaseMock._chain.single.mockResolvedValueOnce({ data: fakeRow, error: null })

    const { data, error } = await createNote({
      threadId: 't1',
      authorId: 'u1',
      authorRole: 'student',
      body: 'hola',
    })
    expect(error).toBeNull()
    expect(data).toEqual(fakeRow)
  })
})

// ============================================================
// v35 — autoría de las notas mirror (bug del modo coach, 2026-08-01)
// ------------------------------------------------------------
// Hasta v34 estos writers hardcodeaban {authorId: studentId,
// authorRole: 'student'}. Con el modo coach eso hacía que la RLS
// rechazara el INSERT (comentario perdido en silencio) y que el
// lookup encontrara la nota de la ALUMNA y le pisara el texto.
// ============================================================
const { postWorkoutLogNote, postWorkoutBlockLogNote, fetchSingleMirrorBodies } =
  await import('./api')

const STUDENT = 'student-uuid'
const COACH = 'coach-uuid'

function insertedRow() {
  expect(supabaseMock._chain.insert).toHaveBeenCalledTimes(1)
  return supabaseMock._chain.insert.mock.calls[0][0]
}

function authorRoleFilters() {
  return supabaseMock._chain.eq.mock.calls.filter((c) => c[0] === 'author_role').map((c) => c[1])
}

describe('mirror writers — autoría (v35)', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    // 1º maybeSingle = lookup del mirror (no existe) · 2º = getStudentThread
    supabaseMock._chain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'thread-1' }, error: null })
    supabaseMock._chain.single.mockResolvedValue({ data: { id: 'note-new' }, error: null })
  })

  it('por default (alumna registrando) escribe como student', async () => {
    await postWorkoutLogNote({ studentId: STUDENT, logId: 'log-1', body: 'me costó' })

    expect(authorRoleFilters()).toEqual(['student'])
    expect(insertedRow()).toMatchObject({
      author_id: STUDENT,
      author_role: 'student',
      context_type: 'workout_log',
      context_id: 'log-1',
    })
  })

  it('en modo coach escribe como coach, con el id de la coach', async () => {
    await postWorkoutLogNote({
      studentId: STUDENT,
      logId: 'log-1',
      body: 'lo cargué yo',
      authorId: COACH,
      authorRole: 'coach',
    })

    // El lookup busca SU propio mirror, no el de la alumna: por eso no puede
    // pisarle el comentario.
    expect(authorRoleFilters()).toEqual(['coach'])
    expect(insertedRow()).toMatchObject({ author_id: COACH, author_role: 'coach' })
  })

  it('mismo comportamiento en el mirror de bloque', async () => {
    await postWorkoutBlockLogNote({
      studentId: STUDENT,
      blockLogId: 'blk-1',
      body: 'circuito ok',
      authorId: COACH,
      authorRole: 'coach',
    })

    expect(authorRoleFilters()).toEqual(['coach'])
    expect(insertedRow()).toMatchObject({
      author_id: COACH,
      author_role: 'coach',
      context_type: 'workout_block_log',
    })
  })

  it('rol coach sin authorId falla en el cliente, sin pegarle a la DB', async () => {
    const { data, error } = await postWorkoutLogNote({
      studentId: STUDENT,
      logId: 'log-1',
      body: 'x',
      authorRole: 'coach',
    })

    expect(data).toBeNull()
    expect(error.code).toBe('INVALID_INPUT')
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })
})

describe('fetchSingleMirrorBodies — filtro por autor (v35)', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    // Un mismo log con DOS mirrors vivos: el de la alumna y el de la coach.
    supabaseMock._chain.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { context_id: 'log-1', author_role: 'student', body: 'lo de la alumna' },
          { context_id: 'log-1', author_role: 'coach', body: 'lo de la coach' },
        ],
        error: null,
      })
    )
  })

  it('sin filtro gana el último (comportamiento previo, no determinístico)', async () => {
    const map = await fetchSingleMirrorBodies({
      contextType: 'workout_log',
      contextIds: ['log-1'],
    })
    expect(map.get('log-1')).toBe('lo de la coach')
  })

  it('con authorRole devuelve el mirror de ese autor', async () => {
    const asStudent = await fetchSingleMirrorBodies({
      contextType: 'workout_log',
      contextIds: ['log-1'],
      authorRole: 'student',
    })
    expect(asStudent.get('log-1')).toBe('lo de la alumna')

    const asCoach = await fetchSingleMirrorBodies({
      contextType: 'workout_log',
      contextIds: ['log-1'],
      authorRole: 'coach',
    })
    expect(asCoach.get('log-1')).toBe('lo de la coach')
  })
})
