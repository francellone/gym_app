// ============================================================
// Primer arranque del día en Entrenar: plan pintado desde el último snapshot
// ------------------------------------------------------------
// Lo que estos tests protegen:
//  1. Con un snapshot de OTRO día, el plan se ve al instante (sin spinner a
//     pantalla completa) mientras la red todavía no contestó.
//  2. Ese plan está en SOLO LECTURA: la zona de carga queda `inert` y no se
//     escribe un snapshot "de hoy" con datos sin confirmar.
//  3. Si la red falla, el plan pintado no se borra y aparece "Reintentar".
//  4. Si ya no hay plan activo, lo pintado de caché se limpia.
//  5. Si el plan cambió, se reemplaza por el nuevo y se habilita la carga.
// Diagnóstico: memoria del proyecto, lentitud-dashboard-calendario-infra.md
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { format } from 'date-fns'
import { createSupabaseMock } from '@/test/mocks/supabase'
import { writeWorkoutSnapshot, readWorkoutSnapshot } from '../workoutSnapshot'

const STUDENT_ID = 'persona-0001'
const TODAY = format(new Date(), 'yyyy-MM-dd')
const YESTERDAY_MS = Date.now() - 20 * 60 * 60 * 1000

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock, supabaseIsolated: supabaseMock }))
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: STUDENT_ID },
    profile: { id: STUDENT_ID, role: 'student', coach_id: 'coach-0001' },
  }),
}))

const { default: TodayWorkoutPage } = await import('./TodayWorkoutPage')

function exercise(id, name) {
  return {
    id,
    plan_id: 'plan-viejo',
    section: 'day_a',
    order_index: 0,
    block_id: null,
    exercise_id: `cat-${id}`,
    suggested_sets: 3,
    suggested_reps: '10',
    exercise: { id: `cat-${id}`, name },
  }
}

function seedYesterday() {
  writeWorkoutSnapshot({
    studentId: STUDENT_ID,
    selectedDate: '2000-01-01',
    now: YESTERDAY_MS,
    data: {
      studentName: '',
      assignment: { id: 'a-viejo', plan_id: 'plan-viejo', plan: { title: 'Plan de ayer' } },
      planExercises: [exercise('pe-1', 'Sentadilla de ayer')],
      planBlocks: [],
      logs: {
        'pe-1': { id: 'l1', plan_exercise_id: 'pe-1', logged_date: '2000-01-01', completed: true },
      },
      blockLogs: {},
      session: { id: 's1', started_at: '2000-01-01T10:00:00Z' },
      recentLogs: [],
      recentExerciseLogs: [],
      recentBlockLogs: [],
      prescriptionByEx: {},
      exerciseNotes: [],
      threadId: null,
      activeDay: 'day_a',
      wellbeing: { id: 'w1' },
    },
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/workout']}>
      <TodayWorkoutPage />
    </MemoryRouter>
  )
}

// Respuestas por tabla; lo que no esté listado contesta vacío.
function answerByTable(answers) {
  supabaseMock.from.mockImplementation((table) => {
    const chain = { ...supabaseMock._chain }
    for (const k of Object.keys(chain)) {
      if (k === 'then' || k === 'single' || k === 'maybeSingle') continue
      chain[k] = vi.fn(() => chain)
    }
    const res = answers[table]
    const value = typeof res === 'function' ? res() : (res ?? { data: [], error: null })
    if (value === 'pending') {
      const never = new Promise(() => {})
      chain.then = (...a) => never.then(...a)
      chain.maybeSingle = () => never
      chain.single = () => never
    } else {
      chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject)
      const one = { data: Array.isArray(value.data) ? null : value.data, error: value.error }
      chain.maybeSingle = () => Promise.resolve(one)
      chain.single = () => Promise.resolve(one)
    }
    return chain
  })
}

beforeEach(() => {
  window.localStorage.clear()
  supabaseMock.from.mockReset()
  supabaseMock.rpc.mockReset()
  supabaseMock.rpc.mockResolvedValue({ data: null, error: null })
})

describe('Entrenar — primer arranque del día con plan guardado de otro día', () => {
  it('pinta el plan al instante, en solo lectura, sin registros de ayer y sin guardar snapshot de hoy', async () => {
    seedYesterday()
    answerByTable({ plan_assignments: 'pending' })
    const { container } = renderPage()

    expect(screen.getByText('Plan de ayer')).toBeInTheDocument()
    // El bloque del día se ve (cerrado, como siempre): 1 ejercicio, 0 hechos.
    expect(screen.getByText(/0 \/ 1 hechos/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando el plan')
    expect(container.querySelector('[inert]')).not.toBeNull()
    // Nada de ayer aparece como hecho: 0 unidades completas, sin hora de inicio.
    expect(screen.getByText(/^0 \/ \d+ unidades/)).toBeInTheDocument()
    expect(screen.queryByText(/Inicio/)).toBeNull()

    await new Promise((r) => setTimeout(r, 800))
    expect(readWorkoutSnapshot({ studentId: STUDENT_ID, selectedDate: TODAY })).toBeNull()
  })

  it('si la actualización falla, conserva el plan pintado y ofrece reintentar', async () => {
    seedYesterday()
    answerByTable({ plan_assignments: { data: null, error: { message: 'sin red' } } })
    const { container } = renderPage()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No se pudo actualizar el plan')
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByText('Plan de ayer')).toBeInTheDocument()
    expect(container.querySelector('[inert]')).not.toBeNull()
  })

  it('si ya no hay plan activo, limpia lo pintado de caché', async () => {
    seedYesterday()
    answerByTable({ plan_assignments: { data: [], error: null } })
    renderPage()

    await waitFor(() => expect(screen.getByText('Sin plan asignado')).toBeInTheDocument())
    expect(screen.queryByText('Plan de ayer')).toBeNull()
  })

  it('si el plan cambió, lo reemplaza y habilita la carga', async () => {
    seedYesterday()
    answerByTable({
      plan_assignments: {
        data: [{ id: 'a-nuevo', plan_id: 'plan-nuevo', plan: { title: 'Plan nuevo' } }],
        error: null,
      },
      plan_exercises: {
        data: [
          { ...exercise('pe-8', 'Peso muerto nuevo'), plan_id: 'plan-nuevo' },
          { ...exercise('pe-9', 'Remo nuevo'), plan_id: 'plan-nuevo', order_index: 1 },
        ],
        error: null,
      },
    })
    const { container } = renderPage()

    await waitFor(() => expect(screen.getByText('Plan nuevo')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.queryByText('Plan de ayer')).toBeNull()
    // El plan nuevo tiene 2 ejercicios; el de ayer tenía 1.
    expect(screen.getByText(/0 \/ 2 hechos/)).toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 1 hechos/)).toBeNull()
    expect(container.querySelector('[inert]')).toBeNull()
  })

  it('sin nada guardado, sigue mostrando el spinner de siempre', () => {
    answerByTable({ plan_assignments: 'pending' })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
