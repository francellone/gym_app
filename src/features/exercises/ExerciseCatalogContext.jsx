import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ============================================================
// Catálogo de ejercicios compartido (ejercicios + etiquetas + asignaciones)
// ------------------------------------------------------------
// Antes cada página de plan hacía su propio Promise.all de 3 queries y
// después drilleaba `exercises / exerciseTags / tagAssignments` por props
// hasta la fila de ejercicio (3 niveles). Eso hacía imposible crear un
// ejercicio desde el armador: no había forma de que la fila avisara
// "agregá esto al catálogo" hacia arriba.
//
// Ahora la página dueña llama a `useExerciseCatalogData()` (mantiene el
// acceso directo que necesita para guardar el plan) y lo publica con
// `<ExerciseCatalogProvider>`. Cualquier hijo lo lee con `useExerciseCatalog()`.
// ============================================================

const EMPTY_CATALOG = {
  exercises: [],
  exerciseTags: [],
  tagAssignments: [],
  loading: false,
  refresh: async () => {},
  upsertExercise: () => {},
}

const ExerciseCatalogContext = createContext(null)

function sortByName(list) {
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

/**
 * Hook de datos: hace el fetch y expone el catálogo + acciones.
 * Lo usa la página que es dueña del estado (Create/EditPlanPage).
 */
export function useExerciseCatalogData() {
  const [exercises, setExercises] = useState([])
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [exRes, tagsRes, assignRes] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
    ])
    setExercises(exRes.data || [])
    setExerciseTags(tagsRes.data || [])
    setTagAssignments(assignRes.data || [])
    setLoading(false)
    return exRes.data || []
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Inserta (o reemplaza) un ejercicio en el catálogo local sin esperar al
   * refetch, para que el <select> lo tenga disponible en el mismo instante
   * en que se cierra el modal. El refetch corre igual en segundo plano
   * porque el modal también sincroniza etiquetas (otra tabla).
   */
  const upsertExercise = useCallback(
    (exercise) => {
      if (!exercise?.id) return
      setExercises((prev) => {
        const idx = prev.findIndex((e) => e.id === exercise.id)
        if (idx >= 0) return prev.map((e, i) => (i === idx ? exercise : e))
        return sortByName([...prev, exercise])
      })
      refresh()
    },
    [refresh]
  )

  return useMemo(
    () => ({ exercises, exerciseTags, tagAssignments, loading, refresh, upsertExercise }),
    [exercises, exerciseTags, tagAssignments, loading, refresh, upsertExercise]
  )
}

export function ExerciseCatalogProvider({ catalog, children }) {
  return (
    <ExerciseCatalogContext.Provider value={catalog}>{children}</ExerciseCatalogContext.Provider>
  )
}

/** Consumidor. Si no hay provider arriba devuelve un catálogo vacío inerte. */
export function useExerciseCatalog() {
  return useContext(ExerciseCatalogContext) || EMPTY_CATALOG
}
