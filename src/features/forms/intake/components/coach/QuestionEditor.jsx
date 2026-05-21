/**
 * EDITOR DE PREGUNTA
 *
 * Permite al coach editar una pregunta individual:
 *   - Cambiar el label (texto de la pregunta)
 *   - Cambiar el tipo
 *   - Editar opciones (para select/multiselect)
 *   - Marcar como required
 *   - Agregar/editar lógica condicional
 *   - Mover arriba/abajo
 *   - Eliminar (si es removable)
 */

import { useState } from 'react'
import { QUESTION_TYPES, QUESTION_TYPE_META } from '../../schema/question-types.js'

export default function QuestionEditor({
  question,
  isFirst,
  isLast,
  allQuestions,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const [expanded, setExpanded] = useState(false)
  const [optionsText, setOptionsText] = useState(
    (question.options || []).join('\n')
  )

  const meta = QUESTION_TYPE_META[question.type] || {}

  const handleLabelChange = (e) => {
    onChange({ ...question, label: e.target.value })
  }

  const handleTypeChange = (e) => {
    onChange({ ...question, type: e.target.value, options: undefined })
  }

  const handleRequiredToggle = () => {
    if (!question.editable) return
    onChange({ ...question, required: !question.required })
  }

  const handleOptionsBlur = () => {
    const options = optionsText
      .split('\n')
      .map(o => o.trim())
      .filter(Boolean)
    onChange({ ...question, options })
  }

  // Preguntas que pueden ser "padre" para condicionales
  const possibleParents = allQuestions.filter(q =>
    q.id !== question.id &&
    [QUESTION_TYPES.BOOLEAN, QUESTION_TYPES.SELECT, QUESTION_TYPES.MULTISELECT].includes(q.type)
  )

  const handleConditionalParentChange = (e) => {
    const parentId = e.target.value
    if (!parentId) {
      onChange({ ...question, conditional: undefined })
    } else {
      onChange({
        ...question,
        conditional: { dependsOn: parentId, showWhen: true },
      })
    }
  }

  const handleConditionalValueChange = (e) => {
    const val = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value
    onChange({
      ...question,
      conditional: { ...question.conditional, showWhen: val },
    })
  }

  const parentQuestion = question.conditional
    ? allQuestions.find(q => q.id === question.conditional.dependsOn)
    : null

  return (
    <div className={`bg-white rounded-lg border ${
      question.required ? 'border-blue-200' : 'border-gray-200'
    } overflow-hidden`}>

      {/* Fila principal */}
      <div className="flex items-start gap-2 p-3">
        {/* Tipo de pregunta (badge) */}
        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          {meta.icon} {meta.label}
        </span>

        {/* Label editable */}
        <div className="flex-1 min-w-0">
          {question.editable ? (
            <input
              value={question.label}
              onChange={handleLabelChange}
              className="w-full text-sm text-gray-800 border-0 focus:outline-none focus:ring-0 bg-transparent"
              placeholder="Texto de la pregunta..."
            />
          ) : (
            <p className="text-sm text-gray-700">{question.label}</p>
          )}

          {/* Indicadores */}
          <div className="flex gap-2 mt-1">
            {question.required && (
              <span className="text-xs text-blue-500">● Obligatoria</span>
            )}
            {question.conditional && (
              <span className="text-xs text-purple-500">🔀 Condicional</span>
            )}
            {!question.removable && (
              <span className="text-xs text-gray-400">🔒 Fija</span>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onMoveUp} disabled={isFirst}
            className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">▲</button>
          <button onClick={onMoveDown} disabled={isLast}
            className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">▼</button>

          {question.editable && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-gray-400 hover:text-gray-600 text-xs ml-1"
            >
              {expanded ? '▲' : '⚙️'}
            </button>
          )}

          {onRemove && (
            <button onClick={() => {
              if (confirm('¿Eliminar esta pregunta?')) onRemove()
            }} className="p-1 text-red-300 hover:text-red-500 text-xs">✕</button>
          )}
        </div>
      </div>

      {/* Panel de configuración expandido */}
      {expanded && question.editable && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-3">

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de respuesta</label>
            <select
              value={question.type}
              onChange={handleTypeChange}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {Object.entries(QUESTION_TYPES).map(([key, val]) => (
                <option key={val} value={val}>
                  {QUESTION_TYPE_META[val]?.icon} {QUESTION_TYPE_META[val]?.label}
                </option>
              ))}
            </select>
          </div>

          {/* Placeholder (para text/textarea) */}
          {[QUESTION_TYPES.TEXT, QUESTION_TYPES.TEXTAREA, QUESTION_TYPES.PHONE].includes(question.type) && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Placeholder (opcional)</label>
              <input
                type="text"
                value={question.placeholder || ''}
                onChange={e => onChange({ ...question, placeholder: e.target.value })}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Texto de ayuda dentro del campo..."
              />
            </div>
          )}

          {/* Opciones (para select/multiselect) */}
          {meta.hasOptions && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Opciones (una por línea)
              </label>
              <textarea
                value={optionsText}
                onChange={e => setOptionsText(e.target.value)}
                onBlur={handleOptionsBlur}
                rows={4}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                placeholder="Opción 1&#10;Opción 2&#10;Opción 3"
              />
            </div>
          )}

          {/* Escala */}
          {question.type === QUESTION_TYPES.SCALE && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Mín</label>
                <input type="number" value={question.min || 1}
                  onChange={e => onChange({ ...question, min: +e.target.value })}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Máx</label>
                <input type="number" value={question.max || 10}
                  onChange={e => onChange({ ...question, max: +e.target.value })}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}

          {/* Required toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequiredToggle}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                question.required ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                question.required ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-xs text-gray-600">Respuesta obligatoria</span>
          </div>

          {/* Lógica condicional */}
          {possibleParents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                🔀 Mostrar solo si... (opcional)
              </label>
              <select
                value={question.conditional?.dependsOn || ''}
                onChange={handleConditionalParentChange}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 mb-2"
              >
                <option value="">Siempre visible</option>
                {possibleParents.map(pq => (
                  <option key={pq.id} value={pq.id}>
                    {pq.label.length > 50 ? pq.label.slice(0, 50) + '...' : pq.label}
                  </option>
                ))}
              </select>

              {question.conditional && parentQuestion && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Valor que activa esta pregunta:</label>
                  {parentQuestion.type === QUESTION_TYPES.BOOLEAN ? (
                    <select
                      value={String(question.conditional.showWhen)}
                      onChange={handleConditionalValueChange}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  ) : parentQuestion.options ? (
                    <select
                      value={question.conditional.showWhen}
                      onChange={handleConditionalValueChange}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {parentQuestion.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
