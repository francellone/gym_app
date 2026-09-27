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
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronUp, Settings, X } from 'lucide-react'
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
  bilingual = false, // modo bilingüe (docs/plan-formularios-bilingues.md)
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [optionsText, setOptionsText] = useState((question.options || []).join('\n'))
  const [enOptionsText, setEnOptionsText] = useState((question.i18n?.en?.options || []).join('\n'))

  const meta = QUESTION_TYPE_META[question.type] || {}
  // Etiqueta visible del tipo (el valor canónico `question.type` no cambia).
  const typeLabel = (type) =>
    t(`coach.forms.questionTypes.${type}`, {
      defaultValue: QUESTION_TYPE_META[type]?.label || type,
    })

  // ── Versión en inglés ────────────────────────────────────
  const en = question.i18n?.en || {}
  const updateEn = (patch) => {
    onChange({ ...question, i18n: { ...question.i18n, en: { ...en, ...patch } } })
  }

  // Visibilidad por idioma: 'both' | 'solo_es' | 'solo_en'
  const visibility = question.hidden_for?.includes('en')
    ? 'solo_es'
    : question.hidden_for?.includes('es')
      ? 'solo_en'
      : 'both'
  const handleVisibilityChange = (e) => {
    const v = e.target.value
    onChange({
      ...question,
      hidden_for: v === 'both' ? undefined : v === 'solo_es' ? ['en'] : ['es'],
    })
  }

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
      .map((o) => o.trim())
      .filter(Boolean)
    // Si cambian las opciones canónicas y ya había traducción, marcarla
    // desactualizada: el resolver mostrará las canónicas hasta que se revise.
    const changed = JSON.stringify(options) !== JSON.stringify(question.options || [])
    let i18n = question.i18n
    if (changed && i18n?.en?.options?.length) {
      i18n = { ...i18n, en: { ...i18n.en, stale: true } }
    }
    onChange({ ...question, options, i18n })
  }

  const handleEnOptionsBlur = () => {
    const lines = enOptionsText.split('\n').map((o) => o.trim())
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    // Editar la traducción cuenta como revisarla → se limpia stale.
    updateEn({ options: lines, stale: false })
  }

  // Preguntas que pueden ser "padre" para condicionales
  const possibleParents = allQuestions.filter(
    (q) =>
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
    const val =
      e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value
    onChange({
      ...question,
      conditional: { ...question.conditional, showWhen: val },
    })
  }

  const parentQuestion = question.conditional
    ? allQuestions.find((q) => q.id === question.conditional.dependsOn)
    : null

  return (
    <div
      className={`bg-white rounded-lg border ${
        question.required ? 'border-blue-200' : 'border-gray-200'
      } overflow-hidden`}
    >
      {/* Fila principal */}
      <div className="flex items-start gap-2 p-3">
        {/* Tipo de pregunta (badge) */}
        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          {meta.icon} {typeLabel(question.type)}
        </span>

        {/* Label editable */}
        <div className="flex-1 min-w-0">
          {question.editable ? (
            <input
              value={question.label}
              onChange={handleLabelChange}
              className="w-full text-sm text-gray-800 border-0 focus:outline-none focus:ring-0 bg-transparent"
              placeholder={t('coach.forms.question.labelPlaceholder')}
            />
          ) : (
            <p className="text-sm text-gray-700">{question.label}</p>
          )}

          {/* Indicadores */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {question.required && (
              <span className="pill-neutral text-[11px]">{t('coach.forms.question.required')}</span>
            )}
            {question.conditional && (
              <span className="text-[11px] rounded-full px-2 py-0.5 bg-niebla-100 text-niebla-700">
                {t('coach.forms.question.conditional')}
              </span>
            )}
            {!question.removable && (
              <span className="pill-neutral text-[11px]">{t('coach.forms.question.fixed')}</span>
            )}
            {bilingual &&
              (visibility === 'solo_es' ? (
                <span className="pill-neutral text-[11px]">{t('coach.forms.question.onlyEs')}</span>
              ) : visibility === 'solo_en' ? (
                <span className="pill-neutral text-[11px]">{t('coach.forms.question.onlyEn')}</span>
              ) : en.stale ? (
                <span className="pill-warn text-[11px]">{t('coach.forms.question.enStale')}</span>
              ) : en.label?.trim() ? (
                <span className="pill-ok text-[11px]">{t('coach.forms.question.enOk')}</span>
              ) : (
                <span className="pill-neutral text-[11px]">
                  {t('coach.forms.question.untranslated')}
                </span>
              ))}
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label={t('coach.forms.question.moveUp')}
            className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            aria-label={t('coach.forms.question.moveDown')}
            className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs"
          >
            ▼
          </button>

          {question.editable && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-gray-400 hover:text-gray-600 text-xs ml-1"
              aria-label={
                expanded ? t('coach.forms.question.closeEdit') : t('coach.forms.question.edit')
              }
            >
              {expanded ? <ChevronUp size={16} /> : <Settings size={16} />}
            </button>
          )}

          {onRemove && (
            <button
              onClick={() => {
                if (confirm(t('coach.forms.question.confirmDelete'))) onRemove()
              }}
              className="p-1 text-red-300 hover:text-red-500 text-xs"
              aria-label={t('coach.forms.question.delete')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Panel de configuración expandido */}
      {expanded && question.editable && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-3">
          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {t('coach.forms.question.answerType')}
            </label>
            <select
              value={question.type}
              onChange={handleTypeChange}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {Object.entries(QUESTION_TYPES).map(([_key, val]) => (
                <option key={val} value={val}>
                  {QUESTION_TYPE_META[val]?.icon} {typeLabel(val)}
                </option>
              ))}
            </select>
          </div>

          {/* Placeholder (para text/textarea) */}
          {[QUESTION_TYPES.TEXT, QUESTION_TYPES.TEXTAREA, QUESTION_TYPES.PHONE].includes(
            question.type
          ) && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {t('coach.forms.question.placeholderLabel')}
              </label>
              <input
                type="text"
                value={question.placeholder || ''}
                onChange={(e) => onChange({ ...question, placeholder: e.target.value })}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={t('coach.forms.question.placeholderPlaceholder')}
              />
            </div>
          )}

          {/* Opciones (para select/multiselect) */}
          {meta.hasOptions && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {t('coach.forms.question.optionsLabel')}
              </label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                onBlur={handleOptionsBlur}
                rows={4}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                placeholder={t('coach.forms.question.optionsPlaceholder')}
              />
            </div>
          )}

          {/* Escala */}
          {question.type === QUESTION_TYPES.SCALE && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {t('coach.forms.question.min')}
                </label>
                <input
                  type="number"
                  value={question.min || 1}
                  onChange={(e) => onChange({ ...question, min: +e.target.value })}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {t('coach.forms.question.max')}
                </label>
                <input
                  type="number"
                  value={question.max || 10}
                  onChange={(e) => onChange({ ...question, max: +e.target.value })}
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
                question.required ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                  question.required ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-xs text-gray-600">
              {t('coach.forms.question.requiredToggle')}
            </span>
          </div>

          {/* Lógica condicional */}
          {possibleParents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {t('coach.forms.question.showIfLabel')}
              </label>
              <select
                value={question.conditional?.dependsOn || ''}
                onChange={handleConditionalParentChange}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 mb-2"
              >
                <option value="">{t('coach.forms.question.alwaysVisible')}</option>
                {possibleParents.map((pq) => (
                  <option key={pq.id} value={pq.id}>
                    {pq.label.length > 50 ? pq.label.slice(0, 50) + '...' : pq.label}
                  </option>
                ))}
              </select>

              {question.conditional && parentQuestion && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {t('coach.forms.question.triggerValue')}
                  </label>
                  {parentQuestion.type === QUESTION_TYPES.BOOLEAN ? (
                    <select
                      value={String(question.conditional.showWhen)}
                      onChange={handleConditionalValueChange}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="true">{t('common.yes')}</option>
                      <option value="false">{t('common.no')}</option>
                    </select>
                  ) : parentQuestion.options ? (
                    <select
                      value={question.conditional.showWhen}
                      onChange={handleConditionalValueChange}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {parentQuestion.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* ── Versión en inglés (modo bilingüe) ─────────── */}
          {bilingual && (
            <div className="border-t border-gray-200 pt-3 space-y-3">
              <label className="text-xs font-semibold text-gray-700 block">
                {t('coach.forms.question.enVersion')}
              </label>

              {/* Visibilidad por idioma */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {t('coach.forms.question.visibilityLabel')}
                </label>
                <select
                  value={visibility}
                  onChange={handleVisibilityChange}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="both">{t('coach.forms.question.visibilityBoth')}</option>
                  <option value="solo_es">{t('coach.forms.question.visibilityOnlyEs')}</option>
                  <option value="solo_en">{t('coach.forms.question.visibilityOnlyEn')}</option>
                </select>
              </div>

              {visibility !== 'solo_es' && (
                <>
                  {/* Aviso de traducción desactualizada */}
                  {en.stale && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-amber-700">
                          {t('coach.forms.question.staleWarning')}
                        </p>
                        <button
                          onClick={() => updateEn({ stale: false })}
                          className="text-xs text-amber-800 underline mt-1"
                        >
                          {t('coach.forms.question.staleReviewed')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      {t('coach.forms.question.enLabel')}
                    </label>
                    <input
                      type="text"
                      value={en.label || ''}
                      onChange={(e) => updateEn({ label: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="What is your...?"
                    />
                  </div>

                  {[QUESTION_TYPES.TEXT, QUESTION_TYPES.TEXTAREA, QUESTION_TYPES.PHONE].includes(
                    question.type
                  ) && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        {t('coach.forms.question.enPlaceholderLabel')}
                      </label>
                      <input
                        type="text"
                        value={en.placeholder || ''}
                        onChange={(e) => updateEn({ placeholder: e.target.value })}
                        className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  )}

                  {meta.hasOptions && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        {t('coach.forms.question.enOptionsLabel')}
                      </label>
                      <textarea
                        value={enOptionsText}
                        onChange={(e) => setEnOptionsText(e.target.value)}
                        onBlur={handleEnOptionsBlur}
                        rows={4}
                        className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        placeholder="Option 1&#10;Option 2&#10;Option 3"
                      />
                      {(en.options?.length || 0) > 0 &&
                        en.options.length !== (question.options || []).length && (
                          <p className="text-xs text-amber-600 mt-1">
                            {t('coach.forms.question.enOptionsMismatch', {
                              translated: en.options.length,
                              total: (question.options || []).length,
                            })}
                          </p>
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
