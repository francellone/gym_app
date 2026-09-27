/**
 * GESTOR DE PLANTILLAS
 *
 * Modal para:
 *   - Ver plantillas disponibles (predefinidas + guardadas)
 *   - Cargar una plantilla en el constructor
 *   - Guardar la configuración actual como nueva plantilla
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_TEMPLATES } from '../../schema/default-form.js'

export default function TemplateManager({
  templates = [],
  currentConfig: _currentConfig,
  onLoad,
  onClose,
  onSaveNew,
}) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('load') // 'load' | 'save'

  const allTemplates = [
    // Las predefinidas son texto de la app (se traducen por template_id); las
    // guardadas son texto libre de la coach.
    ...DEFAULT_TEMPLATES.map((tpl) => ({
      id: tpl.template_id,
      name: t(`coach.forms.templates.predefined.${tpl.template_id}.name`, {
        defaultValue: tpl.template_name,
      }),
      description: t(`coach.forms.templates.predefined.${tpl.template_id}.description`, {
        defaultValue: tpl.description,
      }),
      isPredefined: true,
    })),
    ...templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description || '',
      isPredefined: false,
      config: tpl.config,
    })),
  ]

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await onSaveNew?.(newName.trim())
      setNewName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-tinta/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-tarjeta shadow-flotante w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('coach.forms.templates.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {[
            { id: 'load', label: t('coach.forms.templates.tabLoad') },
            { id: 'save', label: t('coach.forms.templates.tabSave') },
          ].map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                tab === tb.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-texto2 hover:text-tinta'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'load' && (
            <div className="space-y-3">
              {allTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-durazno-200 hover:bg-durazno-50 cursor-pointer transition-colors group"
                  onClick={() => tpl.config && onLoad(tpl.config)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-primary-700">
                        {tpl.name}
                      </p>
                      {tpl.isPredefined && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {t('coach.forms.templates.predefinedBadge')}
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{tpl.description}</p>
                    )}
                  </div>
                  <button
                    className="text-xs text-primary-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    onClick={() => tpl.config && onLoad(tpl.config)}
                  >
                    {t('coach.forms.templates.useThis')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'save' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{t('coach.forms.templates.saveHint')}</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {t('coach.forms.templates.nameLabel')}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder={t('coach.forms.templates.namePlaceholder')}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!newName.trim() || saving}
                className="btn-primary w-full"
              >
                {saving ? t('common.saving') : t('coach.forms.templates.saveButton')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
