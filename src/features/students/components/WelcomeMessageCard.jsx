import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Copy, Check, MessageCircle, AlertTriangle } from 'lucide-react'
import { buildWelcomeMessage, whatsappShareUrl } from '../lib/welcomeMessage'

// Pantalla que ve la coach después de crear una cuenta: el mensaje listo para
// mandarle a la persona, en el idioma de la persona. Ver lib/welcomeMessage.js.
export default function WelcomeMessageCard({
  created,
  coachName,
  onViewProfile,
  onCreateAnother,
  onBack,
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const message = useMemo(
    () =>
      buildWelcomeMessage({
        lang: created.language,
        name: created.name,
        coachName:
          String(coachName || '')
            .trim()
            .split(/\s+/)[0] || '',
        email: created.email,
        password: created.password,
        origin: window.location.origin,
      }),
    [created, coachName]
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el texto queda seleccionable en el cuadro.
      setCopied(false)
    }
  }

  const languageLabel =
    created.language === 'en'
      ? t('coach.students.welcome.langEn')
      : t('coach.students.welcome.langEs')

  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
          <CheckCircle2 size={18} className="text-green-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">{t('coach.students.welcome.title')}</h2>
          <p className="text-sm text-gray-500">
            {t('coach.students.welcome.subtitle', { name: created.name, language: languageLabel })}
          </p>
        </div>
      </div>

      <textarea
        readOnly
        value={message}
        rows={9}
        className="input font-mono text-sm w-full"
        onFocus={(e) => e.target.select()}
        aria-label={t('coach.students.welcome.title')}
      />

      <p className="flex items-start gap-2 text-xs text-amber-700">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        {t('coach.students.welcome.passwordOnce')}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-primary flex items-center gap-2">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t('coach.students.welcome.copied') : t('coach.students.welcome.copy')}
        </button>
        <a
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-2"
        >
          <MessageCircle size={16} />
          {t('coach.students.welcome.whatsapp')}
        </a>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onViewProfile} className="btn-ghost">
          {t('coach.students.welcome.viewProfile')}
        </button>
        <button type="button" onClick={onCreateAnother} className="btn-ghost">
          {t('coach.students.welcome.createAnother')}
        </button>
        <button type="button" onClick={onBack} className="btn-ghost">
          {t('coach.students.welcome.backToList')}
        </button>
      </div>
    </div>
  )
}
