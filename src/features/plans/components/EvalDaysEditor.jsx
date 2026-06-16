import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, ChevronUp, ChevronDown, PlayCircle } from 'lucide-react'
import { getDynamicSections } from '../helpers'
import {
  EXERCISE_EVAL_TYPES,
  METHODS,
  PRUEBA_TYPES,
  emptyEvalExercise,
} from '@/features/evaluations/helpers'

// ============================================================
// EvalDaysEditor — editor de evaluaciones exercise-based (doc 38)
// ------------------------------------------------------------
// Organiza los ejercicios de la evaluación por días (Día A/B/C…) y
// permite elegir tipo + método de evaluación por ejercicio, con un
// toggle global "Mismo método para todos / Por ejercicio".
//
// Props:
//   planEvalType  'one_rm' | 'max_reps' | 'custom' | 'mixed'
//   sessionsPerWeek  número de días (1–7)
//   evalDays      { day_a: [row], day_b: [row], ... }
//   onChange(nextEvalDays)
//   exercises     catálogo de ejercicios [{id, name}]
//   exerciseTags  etiquetas del coach [{id, name, color}] (para filtrar, Q5)
//   tagAssignments asignaciones ejercicio↔tag [{exercise_id, tag_id}]
//   onDeleteRow(rowId)  callback opcional para trackear filas borradas (edit)
//   sameMethod    bool — modo "mismo para todos"
//   onSameMethodChange(bool)
//   globalType / globalMethod  tipo+método global cuando sameMethod=true
//   onGlobalChange({ type, method })
// ============================================================
export default function EvalDaysEditor({
  planEvalType,
  sessionsPerWeek,
  evalDays,
  onChange,
  exercises,
  exerciseTags = [],
  tagAssignments = [],
  onDeleteRow,
  sameMethod,
  onSameMethodChange,
  globalType,
  globalMethod,
  onGlobalChange,
}) {
  const sections = getDynamicSections(sessionsPerWeek, false)
  const [activeSection, setActiveSection] = useState(sections[0]?.id || 'day_a')

  // Q5 — filtro por etiqueta del catálogo. Por defecto, al armar una eval
  // se preselecciona la carpeta "EVALUACIONES" si el coach la tiene creada.
  // `tagFilterOverride === null` significa "todavía sin tocar → usar default".
  const defaultEvalTagId =
    exerciseTags.find((t) => (t.name || '').trim().toUpperCase() === 'EVALUACIONES')?.id || ''
  const [tagFilterOverride, setTagFilterOverride] = useState(null)
  const tagFilter = tagFilterOverride === null ? defaultEvalTagId : tagFilterOverride

  const filteredExercises = tagFilter
    ? exercises.filter((e) =>
        tagAssignments.some((ta) => ta.exercise_id === e.id && ta.tag_id === tagFilter)
      )
    : exercises

  // Para tipos fijos (one_rm/max_reps/custom) el método es siempre el mismo
  // y no hay selección por ejercicio. El toggle sólo aplica a `mixed`.
  const isMixed = planEvalType === 'mixed'
  const effectiveSameMethod = isMixed ? sameMethod : true

  const currentRows = evalDays[activeSection] || []

  function updateRow(section, index, patch) {
    const next = {
      ...evalDays,
      [section]: (evalDays[section] || []).map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }
    onChange(next)
  }

  function addRow(section) {
    const defaultType = isMixed ? globalType || 'one_rm' : planEvalType
    const row = emptyEvalExercise(section, defaultType)
    row.order_index = (evalDays[section] || []).length
    onChange({ ...evalDays, [section]: [...(evalDays[section] || []), row] })
  }

  function removeRow(section, index) {
    const target = (evalDays[section] || [])[index]
    if (target?.id && onDeleteRow) onDeleteRow(target.id)
    onChange({
      ...evalDays,
      [section]: (evalDays[section] || [])
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, order_index: i })),
    })
  }

  function moveRow(section, index, dir) {
    const j = index + dir
    const list = [...(evalDays[section] || [])]
    if (j < 0 || j >= list.length) return
    const [item] = list.splice(index, 1)
    list.splice(j, 0, item)
    onChange({ ...evalDays, [section]: list.map((r, i) => ({ ...r, order_index: i })) })
  }

  return (
    <div className="space-y-4">
      {/* Toggle método (solo en mixta) */}
      {isMixed && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSameMethodChange(true)}
            className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all ${
              sameMethod
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Mismo método para todos
          </button>
          <button
            type="button"
            onClick={() => onSameMethodChange(false)}
            className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all ${
              !sameMethod
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Método por ejercicio
          </button>
        </div>
      )}

      {/* Selector global (mixta + mismo método) */}
      {isMixed && sameMethod && (
        <TypeMethodSelector
          type={globalType || 'one_rm'}
          method={globalMethod || ''}
          onChange={(type, method) => onGlobalChange({ type, method })}
        />
      )}

      {/* Tabs de días */}
      {sections.length > 1 && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {sections.map((s) => {
            const count = (evalDays[s.id] || []).length
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`flex-shrink-0 py-2 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeSection === s.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.label}
                {count > 0 && (
                  <span className="ml-1 bg-purple-100 text-purple-700 rounded-full px-1.5 text-xs">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro por etiqueta del catálogo (Q5) */}
      {exerciseTags.length > 0 && (
        <div>
          <label className="label text-xs">Filtrar ejercicios por etiqueta</label>
          <select
            className="input text-sm"
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
        </div>
      )}

      {/* Filas de ejercicios del día activo */}
      <div className="space-y-3">
        {currentRows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">
            Este día no tiene ejercicios todavía.
          </p>
        )}
        {currentRows.map((row, i) => (
          <EvalExerciseRow
            key={row.id || `new-${i}`}
            row={row}
            index={i}
            total={currentRows.length}
            exercises={exercises}
            optionExercises={filteredExercises}
            showTypeMethod={isMixed && !sameMethod}
            onUpdate={(patch) => updateRow(activeSection, i, patch)}
            onRemove={() => removeRow(activeSection, i)}
            onMove={(dir) => moveRow(activeSection, i, dir)}
          />
        ))}
        <button
          type="button"
          onClick={() => addRow(activeSection)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} /> Agregar ejercicio
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Selector de tipo + método (reusado a nivel global y por fila)
// ============================================================
function TypeMethodSelector({ type, method, onChange }) {
  const methodsForType = METHODS[type] || []
  return (
    <div className="space-y-2">
      <div>
        <label className="label text-xs">Tipo de evaluación</label>
        <div className="grid grid-cols-3 gap-1.5">
          {EXERCISE_EVAL_TYPES.map((et) => (
            <button
              key={et.key}
              type="button"
              onClick={() => {
                const nextMethods = METHODS[et.key] || []
                onChange(et.key, nextMethods[0]?.key || '')
              }}
              className={`text-center px-2 py-2 rounded-xl border text-xs font-medium transition-all ${
                type === et.key
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="mr-1">{et.icon}</span>
              {et.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
      {methodsForType.length > 0 && (
        <div>
          <label className="label text-xs">Método</label>
          <select
            className="input text-sm"
            value={method || ''}
            onChange={(e) => onChange(type, e.target.value)}
          >
            {methodsForType.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {type === 'custom' && (
        <div>
          <label className="label text-xs">Tipo de prueba</label>
          <select
            className="input text-sm"
            value={method || 'libre'}
            onChange={(e) => onChange(type, e.target.value)}
          >
            {PRUEBA_TYPES.map((pt) => (
              <option key={pt.key} value={pt.key}>
                {pt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Fila de un ejercicio de evaluación
// ============================================================
function EvalExerciseRow({
  row,
  index,
  total,
  exercises,
  optionExercises,
  showTypeMethod,
  onUpdate,
  onRemove,
  onMove,
}) {
  const [expanded, setExpanded] = useState(true)
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [newExName, setNewExName] = useState('')

  const selectedExercise = exercises.find((e) => e.id === row.exercise_id)
  const showSetsInputs = row.eval_type === 'one_rm' || row.eval_type === 'max_reps'

  // Opciones del dropdown = lista filtrada por etiqueta (Q5), pero siempre
  // incluyendo el ejercicio ya seleccionado aunque quede fuera del filtro.
  const dropdownExercises = optionExercises || exercises
  const selectedOutsideFilter =
    selectedExercise && !dropdownExercises.some((e) => e.id === selectedExercise.id)

  async function handleCreateExercise() {
    if (!newExName.trim()) return
    try {
      const { data: newEx, error } = await supabase
        .from('exercises')
        .insert({ name: newExName.trim() })
        .select()
        .single()
      if (error) throw error
      onUpdate({ exercise_id: newEx.id, video_url: newEx.video_url || '' })
      setCreatingExercise(false)
      setNewExName('')
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">
          {selectedExercise?.name || 'Nuevo ejercicio'}
        </span>
        {row.mandatory && (
          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
            Oblig.
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 px-1"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 px-1">
          <Trash2 size={15} />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Ejercicio (obligatorio, del catálogo) */}
          <div>
            <label className="label text-xs">Ejercicio *</label>
            {!creatingExercise ? (
              <div className="flex gap-2">
                <select
                  className="input flex-1 text-sm"
                  value={row.exercise_id || ''}
                  onChange={(e) => {
                    const ex = exercises.find((x) => x.id === e.target.value)
                    onUpdate({ exercise_id: e.target.value, video_url: ex?.video_url || '' })
                  }}
                >
                  <option value="">— Seleccionar ejercicio —</option>
                  {selectedOutsideFilter && (
                    <option value={selectedExercise.id}>{selectedExercise.name}</option>
                  )}
                  {dropdownExercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingExercise(true)}
                  className="btn-secondary text-xs px-3 whitespace-nowrap"
                >
                  + Nuevo
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Nombre del ejercicio"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateExercise()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateExercise}
                  className="btn-primary text-xs px-3"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingExercise(false)
                    setNewExName('')
                  }}
                  className="btn-secondary text-xs px-3"
                >
                  ×
                </button>
              </div>
            )}
            {row.video_url && row.video_url.startsWith('http') && (
              <a
                href={row.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1"
              >
                <PlayCircle size={13} /> Ver video de referencia
              </a>
            )}
          </div>

          {/* Tipo + método por ejercicio (solo en mixta por-ejercicio) */}
          {showTypeMethod && (
            <TypeMethodSelector
              type={row.eval_type || 'one_rm'}
              method={row.eval_method || ''}
              onChange={(type, method) => onUpdate({ eval_type: type, eval_method: method })}
            />
          )}

          {/* Campos de carga para one_rm / max_reps */}
          {showSetsInputs && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label text-xs">Series sug.</label>
                <input
                  className="input text-sm"
                  placeholder="3"
                  value={row.suggested_sets || ''}
                  onChange={(e) => onUpdate({ suggested_sets: e.target.value })}
                />
              </div>
              <div>
                <label className="label text-xs">Reps sug.</label>
                <input
                  className="input text-sm"
                  placeholder="ej: 5"
                  value={(row.suggested_reps_array || [''])[0] || ''}
                  onChange={(e) => onUpdate({ suggested_reps_array: [e.target.value] })}
                />
              </div>
              <div>
                <label className="label text-xs">Peso sug. (kg)</label>
                <input
                  className="input text-sm"
                  placeholder="ej: 60"
                  value={(row.suggested_weights_array || [''])[0] || ''}
                  onChange={(e) => onUpdate({ suggested_weights_array: [e.target.value] })}
                />
              </div>
            </div>
          )}

          {/* Instrucciones */}
          <div>
            <label className="label text-xs">Instrucciones</label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder="Describí cómo ejecutar la prueba..."
              value={row.instructions || ''}
              onChange={(e) => onUpdate({ instructions: e.target.value })}
            />
          </div>

          {/* Valor esperado */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Valor esperado (opcional)</label>
              <input
                className="input text-sm"
                placeholder="ej: 10"
                value={row.expected_value || ''}
                onChange={(e) => onUpdate({ expected_value: e.target.value })}
              />
            </div>
            <div>
              <label className="label text-xs">Unidad</label>
              <input
                className="input text-sm"
                placeholder="ej: reps, kg, seg"
                value={row.expected_unit || ''}
                onChange={(e) => onUpdate({ expected_unit: e.target.value })}
              />
            </div>
          </div>

          {/* Obligatoria */}
          <div
            className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
              row.mandatory ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
            }`}
            onClick={() => onUpdate({ mandatory: !row.mandatory })}
          >
            <input
              type="checkbox"
              readOnly
              checked={!!row.mandatory}
              className="w-4 h-4 pointer-events-none text-red-500"
            />
            <span
              className={`text-xs font-medium ${row.mandatory ? 'text-red-700' : 'text-gray-600'}`}
            >
              Ejercicio obligatorio
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
