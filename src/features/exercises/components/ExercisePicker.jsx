import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import { useExerciseCatalog } from '../ExerciseCatalogContext'
import ExerciseFormModal from './ExerciseFormModal'

// ============================================================
// ExercisePicker — selector de ejercicio + "Nuevo" inline
// ------------------------------------------------------------
// Único componente para elegir un ejercicio del catálogo desde cualquier
// parte del armador de planes (fuerza / aeróbico / circuito / evaluaciones).
// Incluye el filtro por etiqueta y el botón que abre el MISMO modal que la
// biblioteca de ejercicios, para no tener que salir del plan.
//
// Props:
//   value                exercise_id seleccionado
//   onChange(id, ex)     ex = fila completa del catálogo (o null si se limpia)
//   label                texto del label ('' o null para no mostrarlo)
//   required             agrega el asterisco
//   placeholder          texto de la opción vacía
//   options              lista a mostrar (si la maneja el padre); si se pasa,
//                        el filtro interno por etiqueta queda desactivado
//   defaultTagName       preselecciona la etiqueta con ese nombre (ej: EVALUACIONES)
//   createTagIds         etiquetas a preseleccionar en el modal de alta rápida
//                        (por defecto, la del filtro activo)
//   size                 'sm' | 'xs' — densidad del control
// ============================================================
export default function ExercisePicker({
  value,
  onChange,
  label = 'Ejercicio',
  required = false,
  placeholder = 'Seleccionar...',
  options = null,
  defaultTagName = null,
  createTagIds = null,
  size = 'sm',
  children,
}) {
  const { exercises, exerciseTags, tagAssignments, upsertExercise } = useExerciseCatalog()
  const [showModal, setShowModal] = useState(false)

  // El filtro por etiqueta es interno salvo que el padre pase `options`.
  const ownsFilter = options === null
  const defaultTagId =
    (defaultTagName &&
      exerciseTags.find(
        (t) => (t.name || '').trim().toUpperCase() === defaultTagName.trim().toUpperCase()
      )?.id) ||
    ''
  // null = "todavía sin tocar" → vale el default
  const [tagFilterOverride, setTagFilterOverride] = useState(null)
  const tagFilter = tagFilterOverride === null ? defaultTagId : tagFilterOverride

  const filtered =
    ownsFilter && tagFilter
      ? exercises.filter((e) =>
          tagAssignments.some((ta) => ta.exercise_id === e.id && ta.tag_id === tagFilter)
        )
      : ownsFilter
        ? exercises
        : options

  const selected = value ? exercises.find((e) => e.id === value) : null
  // Un ejercicio recién creado (o el ya elegido) puede quedar fuera del filtro
  // activo. Sin esta opción extra el <select> se ve vacío aunque haya valor.
  const selectedOutsideFilter = selected && !filtered.some((e) => e.id === selected.id)

  const inputSize = size === 'xs' ? 'text-xs py-1' : 'text-sm'

  function handleCreated(exercise) {
    upsertExercise(exercise)
    setShowModal(false)
    if (exercise?.id) onChange(exercise.id, exercise)
  }

  return (
    <div className="space-y-2">
      {/* Filtro por etiqueta */}
      {ownsFilter && exerciseTags.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag size={13} className="text-gray-400 flex-shrink-0" />
          <select
            className={`input ${size === 'xs' ? 'text-[11px] py-1' : 'text-xs py-1.5'}`}
            value={tagFilter}
            onChange={(e) => setTagFilterOverride(e.target.value)}
          >
            <option value="">Todos los ejercicios</option>
            {exerciseTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {tagFilter && <span className="text-xs text-gray-400">{filtered.length} ej.</span>}
        </div>
      )}

      <div>
        {label ? (
          <label className="text-xs text-gray-500 mb-1 block">
            {label} {required && '*'}
          </label>
        ) : null}
        <div className="flex gap-2">
          <select
            className={`input flex-1 ${inputSize}`}
            value={value || ''}
            onChange={(e) => {
              const id = e.target.value
              onChange(id, id ? exercises.find((x) => x.id === id) || null : null)
            }}
          >
            <option value="">{placeholder}</option>
            {selectedOutsideFilter && <option value={selected.id}>{selected.name}</option>}
            {filtered.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="btn-secondary px-2.5 flex items-center gap-1 flex-shrink-0"
            title="Crear un ejercicio nuevo sin salir del plan"
          >
            <Plus size={15} />
            <span className="hidden sm:inline text-xs font-medium">Nuevo</span>
          </button>
        </div>
        {children}
      </div>

      {showModal && (
        <ExerciseFormModal
          exercise={null}
          tags={exerciseTags}
          existingExercises={exercises}
          defaultTagIds={createTagIds || (tagFilter ? [tagFilter] : [])}
          onSave={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
