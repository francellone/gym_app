// ============================================================
// v44 — La coach carga la evaluación por la persona
// ------------------------------------------------------------
// Lo que estos tests protegen:
//  1. El dueño de los datos es el :id de la ruta, NO el usuario logueado.
//     Si esto se rompe, la coach guarda la evaluación en su propia cuenta.
//  2. La autoría de las notas espejo. La RLS de `notes` exige
//     author_id = auth.uid() + author_role='coach'; posteando como alumno el
//     INSERT se rechaza EN SILENCIO (v35: 171 registros de coach → 0 notas).
//  3. El comentario del otro lado se muestra. Hasta v44 la pantalla leía
//     siempre el del alumno: lo que escribía la coach, rotulado "visible al
//     alumno" en su panel, no se pintaba en ningún lado.
// Diseño: memoria del proyecto, coach-carga-evaluacion.md
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createSupabaseMock } from '@/test/mocks/supabase'

const COACH_ID = 'coach-0001'
const STUDENT_ID = 'alumna-0002'
const PLAN_ID = 'plan-0003'
const RESULT_ID = 'result-0004'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock, supabaseIsolated: supabaseMock }))

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: COACH_ID }, profile: { id: COACH_ID, role: 'coach' } }),
}))

const postEvalResultNote = vi.fn().mockResolvedValue({ data: null, error: null })
const postEvalCommentNote = vi.fn().mockResolvedValue({ data: null, error: null })
const fetchSingleMirrorBodies = vi.fn().mockResolvedValue(new Map())
const fetchEvalMirrorBodies = vi.fn().mockResolvedValue(new Map())

vi.mock('@/features/notes/api', () => ({
  postEvalResultNote: (...a) => postEvalResultNote(...a),
  postEvalCommentNote: (...a) => postEvalCommentNote(...a),
  fetchSingleMirrorBodies: (...a) => fetchSingleMirrorBodies(...a),
  fetchEvalMirrorBodies: (...a) => fetchEvalMirrorBodies(...a),
}))

const { default: EvalWorkoutPage } = await import('./pages/EvalWorkoutPage')

const PLAN = { id: PLAN_ID, title: 'Antropometría', eval_type: 'body_comp', eval_method: '' }

// fetchPlan de un protocolo entero (no exercise-based):
//   single()      → el plan
//   maybeSingle() → (modo coach) el nombre de la persona, y después el
//                   evaluation_result del día, si existe.
function mockLoad({ existingResult = null, coachMode = true } = {}) {
  supabaseMock._chain.single.mockResolvedValueOnce({ data: PLAN, error: null })
  if (coachMode) {
    supabaseMock._chain.maybeSingle.mockResolvedValueOnce({
      data: { name: 'Jessi' },
      error: null,
    })
  }
  supabaseMock._chain.maybeSingle.mockResolvedValueOnce({ data: existingResult, error: null })
}

function renderCoachMode() {
  return render(
    <MemoryRouter initialEntries={[`/coach/students/${STUDENT_ID}/eval/${PLAN_ID}`]}>
      <Routes>
        <Route path="/coach/students/:id/eval/:planId" element={<EvalWorkoutPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderStudentMode() {
  return render(
    <MemoryRouter initialEntries={[`/student/eval/${PLAN_ID}`]}>
      <Routes>
        <Route path="/student/eval/:planId" element={<EvalWorkoutPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('v44 — modo coach de la evaluación', () => {
  beforeEach(() => {
    supabaseMock.from.mockClear()
    for (const fn of Object.values(supabaseMock._chain)) fn.mockClear?.()
    supabaseMock._chain.single.mockResolvedValue({ data: null, error: null })
    supabaseMock._chain.maybeSingle.mockResolvedValue({ data: null, error: null })
    postEvalResultNote.mockClear()
    postEvalCommentNote.mockClear()
    fetchSingleMirrorBodies.mockClear()
    fetchSingleMirrorBodies.mockResolvedValue(new Map())
  })

  it('guarda en la cuenta de la persona evaluada, no en la de la coach', async () => {
    const user = userEvent.setup()
    mockLoad()
    // El upsert del resultado devuelve su id por .select('id').single()
    supabaseMock._chain.single.mockResolvedValueOnce({ data: { id: RESULT_ID }, error: null })
    renderCoachMode()

    await screen.findByText('Antropometría')
    await user.click(screen.getByRole('button', { name: /guardar evaluación/i }))

    await waitFor(() => expect(supabaseMock._chain.upsert).toHaveBeenCalled())
    const [row] = supabaseMock._chain.upsert.mock.calls[0]
    expect(row.student_id).toBe(STUDENT_ID)
    expect(row.student_id).not.toBe(COACH_ID)
    expect(row.plan_id).toBe(PLAN_ID)
  })

  it('la nota general se postea como coach (si no, la RLS la rechaza en silencio)', async () => {
    const user = userEvent.setup()
    mockLoad()
    supabaseMock._chain.single.mockResolvedValueOnce({ data: { id: RESULT_ID }, error: null })
    renderCoachMode()

    await screen.findByText('Antropometría')
    await user.type(
      screen.getByPlaceholderText(/dato adicional/i),
      'Medido con el plicómetro nuevo'
    )
    await user.click(screen.getByRole('button', { name: /guardar evaluación/i }))

    await waitFor(() => expect(postEvalResultNote).toHaveBeenCalled())
    const arg = postEvalResultNote.mock.calls.at(-1)[0]
    expect(arg.studentId).toBe(STUDENT_ID)
    expect(arg.authorRole).toBe('coach')
    expect(arg.authorId).toBe(COACH_ID)
  })

  it('el banner nombra a la persona: queda claro en qué cuenta cae la carga', async () => {
    mockLoad()
    renderCoachMode()
    expect(await screen.findByText(/Jessi/)).toBeInTheDocument()
  })

  it('muestra la observación del otro lado en solo lectura', async () => {
    // La coach abre la pantalla y ve lo que dejó escrito la persona.
    fetchSingleMirrorBodies.mockImplementation(({ authorRole }) =>
      Promise.resolve(
        authorRole === 'student' ? new Map([[RESULT_ID, 'Me dolió el hombro']]) : new Map()
      )
    )
    mockLoad({ existingResult: { id: RESULT_ID, results: {} } })
    renderCoachMode()

    expect(await screen.findByText('Me dolió el hombro')).toBeInTheDocument()
  })

  it('fuera del modo coach nada cambia: dueño y autoría siguen siendo del alumno', async () => {
    const user = userEvent.setup()
    mockLoad({ coachMode: false })
    supabaseMock._chain.single.mockResolvedValueOnce({ data: { id: RESULT_ID }, error: null })
    renderStudentMode()

    await screen.findByText('Antropometría')
    await user.click(screen.getByRole('button', { name: /guardar evaluación/i }))

    await waitFor(() => expect(supabaseMock._chain.upsert).toHaveBeenCalled())
    expect(supabaseMock._chain.upsert.mock.calls[0][0].student_id).toBe(COACH_ID)
    await waitFor(() => expect(postEvalResultNote).toHaveBeenCalled())
    expect(postEvalResultNote.mock.calls.at(-1)[0].authorRole).toBe('student')
    // Y no se pide el nombre de nadie: no hay banner de modo coach.
    expect(screen.queryByText(/Jessi/)).toBeNull()
  })
})
