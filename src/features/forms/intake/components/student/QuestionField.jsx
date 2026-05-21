/**
 * CAMPO DE PREGUNTA – VISTA ESTUDIANTE
 *
 * Renderiza el input correcto según el tipo de pregunta.
 * Soporta: text, textarea, select, multiselect, boolean, scale, email, phone, number, date
 */

import { QUESTION_TYPES } from '../../schema/question-types.js'

export default function QuestionField({ question, value, onChange, error }) {
  const baseInput = `w-full text-sm border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 transition-colors ${
    error
      ? 'border-red-300 focus:ring-red-400 bg-red-50'
      : 'border-gray-300 focus:ring-blue-400 focus:border-transparent'
  }`

  const handleChange = (val) => onChange(question.id, val)

  switch (question.type) {

    // ── Texto corto ─────────────────────────────────────────
    case QUESTION_TYPES.TEXT:
    case QUESTION_TYPES.EMAIL:
    case QUESTION_TYPES.PHONE:
      return (
        <input
          type={
            question.type === QUESTION_TYPES.EMAIL ? 'email' :
            question.type === QUESTION_TYPES.PHONE ? 'tel' : 'text'
          }
          value={value || ''}
          onChange={e => handleChange(e.target.value)}
          placeholder={question.placeholder || ''}
          autoComplete={question.autoComplete || 'off'}
          className={baseInput}
        />
      )

    // ── Texto largo ─────────────────────────────────────────
    case QUESTION_TYPES.TEXTAREA:
      return (
        <textarea
          value={value || ''}
          onChange={e => handleChange(e.target.value)}
          placeholder={question.placeholder || ''}
          rows={3}
          className={`${baseInput} resize-none`}
        />
      )

    // ── Número ──────────────────────────────────────────────
    case QUESTION_TYPES.NUMBER:
      return (
        <input
          type="number"
          inputMode="numeric"
          value={value || ''}
          onChange={e => handleChange(e.target.value)}
          placeholder={question.placeholder || ''}
          min={question.min}
          max={question.max}
          className={baseInput}
        />
      )

    // ── Fecha ───────────────────────────────────────────────
    case QUESTION_TYPES.DATE:
      return (
        <input
          type="date"
          value={value || ''}
          onChange={e => handleChange(e.target.value)}
          className={baseInput}
        />
      )

    // ── Selección única ─────────────────────────────────────
    case QUESTION_TYPES.SELECT:
      return (
        <div className="space-y-2">
          {(question.options || []).map(option => (
            <label
              key={option}
              onClick={() => handleChange(option)}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                value === option
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                value === option ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              }`}>
                {value === option && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              <span className="text-sm text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      )

    // ── Selección múltiple ──────────────────────────────────
    case QUESTION_TYPES.MULTISELECT: {
      const selected = Array.isArray(value) ? value : []
      const toggle = (option) => {
        const newSelected = selected.includes(option)
          ? selected.filter(v => v !== option)
          : [...selected, option]
        handleChange(newSelected)
      }
      return (
        <div className="space-y-2">
          {(question.options || []).map(option => {
            const isSelected = selected.includes(option)
            return (
              <label
                key={option}
                onClick={() => toggle(option)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                  isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                </div>
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            )
          })}
        </div>
      )
    }

    // ── Sí / No ─────────────────────────────────────────────
    case QUESTION_TYPES.BOOLEAN:
      return (
        <div className="flex gap-3">
          {[
            { val: true, label: '✅ Sí' },
            { val: false, label: '❌ No' },
          ].map(({ val, label }) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleChange(val)}
              className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                value === val
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )

    // ── Escala ──────────────────────────────────────────────
    case QUESTION_TYPES.SCALE: {
      const min = question.min || 1
      const max = question.max || 10
      const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min)
      return (
        <div>
          <div className="flex gap-1 justify-between mb-2">
            {steps.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => handleChange(n)}
                className={`flex-1 py-2 rounded text-sm font-medium border transition-all ${
                  value === n
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{question.minLabel || min}</span>
            <span>{question.maxLabel || max}</span>
          </div>
        </div>
      )
    }

    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => handleChange(e.target.value)}
          className={baseInput}
        />
      )
  }
}
