/**
 * TARJETA DE MÓDULO
 *
 * Muestra un módulo del formulario con controles para:
 *   - Activar/desactivar
 *   - Mover arriba/abajo
 *   - Expandir para editar preguntas
 *   - Editar título y emoji (si es editable)
 *   - Eliminar (si es custom)
 */

import { useState } from 'react'
import QuestionEditor from './QuestionEditor'

export default function ModuleCard({
  module,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(module.title)

  const isDisabled = !module.enabled
  const isRemovable = module.removable

  const handleTitleSave = () => {
    onUpdate({ ...module, title: titleDraft })
    setEditingTitle(false)
  }

  const handleAddQuestion = () => {
    const newQuestion = {
      id: `q_custom_${Date.now()}`,
      type: 'text',
      label: 'Nueva pregunta',
      required: false,
      editable: true,
      removable: true,
      isCustom: true,
    }
    onUpdate({ ...module, questions: [...module.questions, newQuestion] })
  }

  const handleUpdateQuestion = (qId, updated) => {
    onUpdate({
      ...module,
      questions: module.questions.map(q => q.id === qId ? updated : q),
    })
  }

  const handleRemoveQuestion = (qId) => {
    onUpdate({
      ...module,
      questions: module.questions.filter(q => q.id !== qId),
    })
  }

  const handleMoveQuestion = (qId, direction) => {
    const questions = [...module.questions]
    const idx = questions.findIndex(q => q.id === qId)
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= questions.length) return
    const temp = questions[idx]
    questions[idx] = questions[newIdx]
    questions[newIdx] = temp
    onUpdate({ ...module, questions })
  }

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-200 ${
      isDisabled
        ? 'border-gray-200 bg-gray-50 opacity-60'
        : 'border-gray-200 bg-white'
    }`}>

      {/* Header del módulo */}
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Toggle habilitado/deshabilitado */}
        {isRemovable && (
          <button
            onClick={onToggle}
            title={module.enabled ? 'Desactivar módulo' : 'Activar módulo'}
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
              module.enabled ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              module.enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        )}

        {/* Emoji + título */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{module.emoji}</span>

          {editingTitle && module.editable ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
              className="text-sm font-medium border-b border-blue-400 bg-transparent focus:outline-none"
            />
          ) : (
            <span
              className={`text-sm font-medium truncate ${
                module.editable ? 'cursor-pointer hover:text-blue-600' : 'text-gray-700'
              }`}
              onClick={() => module.editable && setEditingTitle(true)}
              title={module.editable ? 'Clic para editar el título' : undefined}
            >
              {module.title}
            </span>
          )}

          {!module.removable && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Fijo</span>
          )}
        </div>

        {/* Controles */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400 mr-1">{module.questions.length} pregs.</span>

          <button
            onClick={onMoveUp}
            disabled={isFirst || isDisabled}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Subir"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast || isDisabled}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Bajar"
          >
            ▼
          </button>

          {onRemove && (
            <button
              onClick={() => {
                if (confirm(`¿Eliminar el módulo "${module.title}"?`)) onRemove()
              }}
              className="p-1 text-red-400 hover:text-red-600"
              title="Eliminar módulo"
            >
              🗑
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600 ml-1"
            title="Editar preguntas"
          >
            {expanded ? '🔼' : '🔽'}
          </button>
        </div>
      </div>

      {/* Lista de preguntas (expandible) */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          {module.questions.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2 italic">Sin preguntas. Agregá una.</p>
          )}

          {module.questions.map((question, idx) => (
            <QuestionEditor
              key={question.id}
              question={question}
              isFirst={idx === 0}
              isLast={idx === module.questions.length - 1}
              allQuestions={module.questions}
              onChange={(updated) => handleUpdateQuestion(question.id, updated)}
              onRemove={question.removable ? () => handleRemoveQuestion(question.id) : null}
              onMoveUp={() => handleMoveQuestion(question.id, 'up')}
              onMoveDown={() => handleMoveQuestion(question.id, 'down')}
            />
          ))}

          {module.editable && (
            <button
              onClick={handleAddQuestion}
              className="w-full text-center text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-lg py-2 hover:bg-blue-50 transition-colors"
            >
              + Agregar pregunta
            </button>
          )}
        </div>
      )}
    </div>
  )
}
