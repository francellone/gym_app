// ============================================================
// CompletionMessageField — mensaje de cierre del plan (Etapa 6)
// ------------------------------------------------------------
// Decisión Franco 2026-09-24: el mensaje de fin de plan es automático y la
// coach lo puede editar al crear el plan. El campo arranca con el texto
// automático; si la coach no lo cambia (o lo deja vacío) se guarda NULL y
// cada persona ve el automático en SU idioma y con el tono que corresponda
// a cómo le fue. Si lo cambia, se muestra tal cual, sea cual sea el
// resultado del plan.
// ============================================================
import { useTranslation } from 'react-i18next'
import { autoCompletionMessage, normalizeCompletionMessage } from '../completionMessage'

export default function CompletionMessageField({
  value,
  onChange,
  id = 'plan-completion-message',
}) {
  const { t, i18n } = useTranslation()
  const shown = value ?? autoCompletionMessage(i18n.language)
  const isAuto = normalizeCompletionMessage(shown) === null
  return (
    <div className="sm:col-span-2">
      <label className="label" htmlFor={id}>
        {t('coach.planEditor.completionMessage.label')}
      </label>
      <textarea
        id={id}
        className="input resize-none"
        rows={3}
        maxLength={1000}
        value={shown}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-gray-500">
        {isAuto
          ? t('coach.planEditor.completionMessage.autoHint')
          : t('coach.planEditor.completionMessage.customHint')}
        {!isAuto && (
          <>
            {' '}
            <button
              type="button"
              className="font-semibold text-primary-600"
              onClick={() => onChange(null)}
            >
              {t('coach.planEditor.completionMessage.backToAuto')}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
