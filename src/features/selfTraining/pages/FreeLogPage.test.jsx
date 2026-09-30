import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  fetchFreePlanId: vi.fn(),
  fetchFreeLogs: vi.fn(),
  fetchLastExerciseLog: vi.fn(),
  ensureFreePlanExercise: vi.fn(),
}))
const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'me' } }) }))
vi.mock('@/features/notes/api', () => ({ postWorkoutLogNote: vi.fn() }))
vi.mock('../api', async (orig) => ({ ...(await orig()), ...api }))
vi.mock('@/features/exercises/ExerciseCatalogContext', () => {
  const exercises = [{ id: 'ex1', name: 'Sentadilla', default_weight_mode: 'with_weight' }]
  return {
    useExerciseCatalogData: () => ({}),
    ExerciseCatalogProvider: ({ children }) => children,
    useExerciseCatalog: () => ({ exercises }),
  }
})
vi.mock('@/features/exercises/components/ExercisePicker', () => ({
  default: ({ value, onChange }) => (
    <select aria-label="picker" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">-</option>
      <option value="ex1">Sentadilla</option>
    </select>
  ),
}))

const { default: FreeLogPage } = await import('./FreeLogPage')

describe('FreeLogPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    rpc.mockReset()
    api.fetchFreePlanId.mockResolvedValue(null)
    api.fetchFreeLogs.mockResolvedValue([])
    api.fetchLastExerciseLog.mockResolvedValue({
      logged_date: '2026-09-20',
      weight_mode: 'with_weight',
      actual_reps_jsonb: [10, 8],
      actual_weights_jsonb: [40, 45],
    })
    api.ensureFreePlanExercise.mockResolvedValue({ planId: 'p', planExerciseId: 'pe' })
    rpc.mockResolvedValue({ data: 'log1', error: null })
  })

  it('precarga lo de la última vez y guarda con el plan libre', async () => {
    render(
      <MemoryRouter>
        <FreeLogPage />
      </MemoryRouter>
    )
    fireEvent.click(await screen.findByRole('button', { name: /Agregar ejercicio/ }))
    fireEvent.change(screen.getByLabelText('picker'), { target: { value: 'ex1' } })
    await waitFor(() =>
      expect(screen.getByLabelText('Repeticiones de la serie 1')).toBeInTheDocument()
    )
    expect(screen.getAllByLabelText(/Repeticiones de la serie/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('save_workout_log')
    expect(args).toMatchObject({
      p_student_id: 'me',
      p_plan_id: 'p',
      p_plan_exercise_id: 'pe',
      p_reps: [10, 8],
      p_weights: [40, 45],
    })
  })
})
