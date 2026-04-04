/**
 * GESTOR DE PLANTILLAS
 *
 * Modal para:
 *   - Ver plantillas disponibles (predefinidas + guardadas)
 *   - Cargar una plantilla en el constructor
 *   - Guardar la configuración actual como nueva plantilla
 */

import { useState } from 'react'
import { DEFAULT_TEMPLATES } from '../../schema/default-form.js'

export default function TemplateManager({
  templates = [],
  currentConfig,
  onLoad,
  onClose,
  onSaveNew,
}) {
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('load') // 'load' | 'save'

  const allTemplates = [
    ...DEFAULT_TEMPLATES.map(t => ({
      id: t.template_id,
      name: t.template_name,
      description: t.description,
      isPredefined: true,
    })),
    ...templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      isPredefined: false,
      config: t.config,
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">📋 Plantillas de formulario</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {[
            { id: 'load', label: '📂 Cargar plantilla' },
            { id: 'save', label: '💾 Guardar actual' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'load' && (
            <div className="space-y-3">
              {allTemplates.map(tpl => (
                <div
                  key={tpl.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors group"
                  onClick={() => tpl.config && onLoad(tpl.config)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700">
                        {tpl.name}
                      </p>
                      {tpl.isPredefined && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          Predefinida
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{tpl.description}</p>
                    )}
                  </div>
                  <button
                    className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    onClick={() => tpl.config && onLoad(tpl.config)}
                  >
                    Usar esta →
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'save' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Guardá la configuración actual como una nueva plantilla para reutilizarla.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Nombre de la plantilla
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Ej: Fitness femenino avanzado"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!newName.trim() || saving}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : '💾 Guardar plantilla'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
