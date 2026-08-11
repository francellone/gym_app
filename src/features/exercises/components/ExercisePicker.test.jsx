import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'coach-1', role: 'coach' } }),
}))
vi.mock('@/features/forms/hooks/useCoachFormLanguages', () => ({
  useCoachFormLanguages: () => ({ bilingual: false }),
}))

const { default: ExercisePicker } = await import('./ExercisePicker')
const { ExerciseCatalogProvider } = await import('../ExerciseCatalogContext')

const EXERCISES = [
  { id: 'ex-1', name: 'Press banca' },
  { id: 'ex-2', name: 'Sentadilla' },
]
const TAGS = [{ id: 'tag-1', name: 'Tren inferior', color: '#000' }]
const ASSIGNMENTS = [{ exercise_id: 'ex-2', tag_id: 'tag-1' }]

function renderPicker({ value = '', onChange = vi.fn(), catalog = {}, ...props } = {}) {
  const full = {
    exercises: EXERCISES,
    exerciseTags: TAGS,
    tagAssignments: ASSIGNMENTS,
    loading: false,
    refresh: vi.fn(),
    upsertExercise: vi.fn(),
    ...catalog,
  }
  const utils = render(
    <ExerciseCatalogProvider catalog={full}>
      <ExercisePicker value={value} onChange={onChange} {...props} />
    </ExerciseCatalogProvider>
  )
  return { ...utils, catalog: full, onChange }
}

describe('ExercisePicker', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
  })

  it('lista el catálogo y ofrece crear uno nuevo sin salir del plan', () => {
    renderPicker()
    expect(screen.getByRole('option', { name: 'Press banca' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sentadilla' })).toBeInTheDocument()
    expect(screen.getByTitle('Crear un ejercicio nuevo sin salir del plan')).toBeInTheDocument()
  })

  it('el filtro por etiqueta acota la lista', async () => {
    const user = userEvent.setup()
    renderPicker()
    const [tagSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(tagSelect, 'tag-1')
    expect(screen.queryByRole('option', { name: 'Press banca' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sentadilla' })).toBeInTheDocument()
  })

  // Regresión: con un filtro activo, el ejercicio ya elegido (o el recién
  // creado) quedaba fuera de las opciones y el select se veía vacío.
  it('mantiene visible el ejercicio elegido aunque quede fuera del filtro', async () => {
    const user = userEvent.setup()
    renderPicker({ value: 'ex-1' })
    const [tagSelect, exerciseSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(tagSelect, 'tag-1')
    expect(screen.getByRole('option', { name: 'Press banca' })).toBeInTheDocument()
    expect(exerciseSelect).toHaveValue('ex-1')
  })

  it('al crear un ejercicio lo manda con created_by, lo suma al catálogo y lo selecciona', async () => {
    const user = userEvent.setup()
    const nuevo = { id: 'ex-3', name: 'Remo con barra' }
    supabaseMock._chain.single.mockResolvedValueOnce({ data: nuevo, error: null })

    const { catalog, onChange } = renderPicker()
    await user.click(screen.getByTitle('Crear un ejercicio nuevo sin salir del plan'))

    await user.type(screen.getByPlaceholderText('Sentadilla con barra'), 'Remo con barra')
    await user.click(screen.getByRole('button', { name: /Guardar/i }))

    await waitFor(() => expect(catalog.upsertExercise).toHaveBeenCalledWith(nuevo))
    expect(onChange).toHaveBeenCalledWith('ex-3', nuevo)

    // Sin created_by la RLS `coach_manage_own_exercises` rechaza el INSERT
    // en silencio (era el bug del viejo "+ Nuevo" de evaluaciones).
    const insertArg = supabaseMock._chain.insert.mock.calls[0][0]
    expect(insertArg).toMatchObject({ name: 'Remo con barra', created_by: 'coach-1' })
  })

  it('avisa antes de crear un ejercicio con un nombre que ya existe', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByTitle('Crear un ejercicio nuevo sin salir del plan'))
    await user.type(screen.getByPlaceholderText('Sentadilla con barra'), 'press BANCA')

    expect(screen.getByText(/Ya existe un ejercicio con ese nombre/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Es otro ejercicio, crearlo igual/i }))
    expect(screen.getByRole('button', { name: /Guardar/i })).toBeEnabled()
  })
})
