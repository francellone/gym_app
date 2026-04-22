import { Plus } from 'lucide-react'
import PlanExerciseRow from '../PlanExerciseRow'
import { emptyPlanExercise } from '../../../utils/planHelpers'

/**
 * Editor del bloque de FUERZA.
 * Mantiene el formato clásico: ejercicios con series, reps y peso por serie.
 */
export default function StrengthBlockEditor({
  block,
  onUpdateExercises,
  exercises = [],
  exerciseTags = [],
  tagAssignments = [],
}) {
  const list = block.exercises || []

  function addExercise() {
    const ex = emptyPlanExercise(block.section)
    ex.order_index = list.length
    onUpdateExercises([...list, ex])
  }

  function updateExercise(index, field, value) {
    const next = list.map((ex, i) => i === index ? { ...ex, [field]: value } : ex)
    onUpdateExercises(next)
  }

  function removeExercise(index) {
    onUpdateExercises(list.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {list.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          Sin ejercicios todavía. Agregá uno abajo 👇
        </p>
      )}

      {list.map((ex, i) => (
        <PlanExerciseRow
          key={ex.id || `new-${i}`}
          ex={ex}
          index={i}
          exercises={exercises}
          exerciseTags={exerciseTags}
          tagAssignments={tagAssignments}
          onUpdate={updateExercise}
          onRemove={removeExercise}
        />
      ))}

      <button
        onClick={addExercise}
        className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
      >
        <Plus size={16} />
        Agregar ejercicio
      </button>
    </div>
  )
}
