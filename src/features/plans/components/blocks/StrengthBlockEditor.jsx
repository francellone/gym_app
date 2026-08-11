import { Plus } from 'lucide-react'
import PlanExerciseRow from '../PlanExerciseRow'
import { emptyPlanExercise, inheritFromFirstBlockmate } from '../../helpers'

/**
 * Editor del bloque de FUERZA.
 * Mantiene el formato clásico: ejercicios con series, reps y peso por serie.
 */
export default function StrengthBlockEditor({ block, onUpdateExercises }) {
  const list = block.exercises || []

  // Q7: Al crear un nuevo ejercicio, arrancamos con la última letra usada
  // (continúa el bloque actual). Si esa letra ya tiene N ejercicios, autoincrementa
  // el número y hereda pausa/series del primero con esa letra.
  // Ej: A1 + B1 + agregar → arranca como B2, no A2.
  function addExercise() {
    const ex = emptyPlanExercise(block.section)
    ex.order_index = list.length

    // Buscar la última letra usada en la lista (recorrer de atrás hacia adelante)
    let lastLetter = ''
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.block_letter) {
        lastLetter = list[i].block_letter
        break
      }
    }
    if (lastLetter) {
      ex.block_letter = lastLetter
    }

    if (ex.block_letter) {
      const tempList = [...list, ex]
      const patches = inheritFromFirstBlockmate({
        list: tempList,
        currentIndex: tempList.length - 1,
        letter: ex.block_letter,
      })
      Object.assign(ex, patches)
    }
    onUpdateExercises([...list, ex])
  }

  function updateExercise(index, field, value) {
    const next = list.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    onUpdateExercises(next)
  }

  // Versión multi-campo: aplica varios campos a la vez en un solo render,
  // evitando que llamadas sucesivas lean un `list` desactualizado del closure.
  function updateExerciseMulti(index, patches) {
    const next = list.map((ex, i) => (i === index ? { ...ex, ...patches } : ex))
    onUpdateExercises(next)
  }

  function removeExercise(index) {
    onUpdateExercises(list.filter((_, i) => i !== index))
  }

  // Q7: Cambio de letra → si ya hay otro ejercicio con esa letra, auto-numerar
  // (A2, A3...) y heredar series/descanso del primero. Si es la primera vez
  // que se usa esa letra, se setea número 1.
  function handleLetterChange(index, newLetter) {
    const patches = inheritFromFirstBlockmate({
      list,
      currentIndex: index,
      letter: newLetter,
    })
    updateExerciseMulti(index, patches)
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
          onUpdate={updateExercise}
          onUpdateMulti={updateExerciseMulti}
          onLetterChange={handleLetterChange}
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
