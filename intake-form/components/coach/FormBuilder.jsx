/**
 * PANEL DEL COACH – CONSTRUCTOR DE FORMULARIOS
 *
 * Permite al coach:
 *   ✅ Editar la introducción (rich text)
 *   ✅ Activar/desactivar módulos
 *   ✅ Cambiar el orden de los módulos (drag or arrows)
 *   ✅ Expandir cada módulo para editar sus preguntas
 *   ✅ Guardar como plantilla
 *   ✅ Cargar una plantilla existente
 *   ✅ Enviar formulario a un estudiante
 *
 * Props:
 *   - coachId: string
 *   - initialConfig: object (del esquema default-form.js)
 *   - templates: array de plantillas guardadas
 *   - onSave: fn(config) → guarda el formulario
 *   - onSendToStudent: fn(config) → abre el modal de selección de alumno
 */

import { useState, useCallback } from 'react'
import ModuleCard from './ModuleCard'
import TemplateManager from './TemplateManager'
import IntroEditor from './IntroEditor'
import FormRenderer from '../student/FormRenderer'
import { buildFormConfig, DEFAULT_MODULES, DEFAULT_INTRO, CONSENT_MODULE } from '../../schema/default-form.js'

export default function FormBuilder({
  coachId,
  initialConfig,
  templates = [],
  onSave,
  onSendToStudent,
}) {
  const [intro, setIntro] = useState(initialConfig?.intro || DEFAULT_INTRO)
  const [modules, setModules] = useState(initialConfig?.modules || DEFAULT_MODULES)
  const [saving, setSaving] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [activeTab, setActiveTab] = useState('form') // 'form' | 'preview'
  const [showPreview, setShowPreview] = useState(false)

  // ──────────────────────────────────────────────────────────
  // Handlers de módulos
  // ──────────────────────────────────────────────────────────

  const toggleModule = useCallback((moduleId) => {
    setModules(prev => prev.map(m =>
      m.id === moduleId && m.removable
        ? { ...m, enabled: !m.enabled }
        : m
    ))
  }, [])

  const moveModule = useCallback((moduleId, direction) => {
    setModules(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex(m => m.id === moduleId)
      const newIdx = direction === 'up' ? idx - 1 : idx + 1

      if (newIdx < 0 || newIdx >= sorted.length) return prev

      // Swap orders
      const result = [...sorted]
      const temp = result[idx].order
      result[idx] = { ...result[idx], order: result[newIdx].order }
      result[newIdx] = { ...result[newIdx], order: temp }
      return result
    })
  }, [])

  const updateModule = useCallback((moduleId, updatedModule) => {
    setModules(prev => prev.map(m => m.id === moduleId ? updatedModule : m))
  }, [])

  const addCustomModule = useCallback(() => {
    const newModule = {
      id: `modulo_custom_${Date.now()}`,
      title: 'Nuevo módulo',
      emoji: '📌',
      enabled: true,
      editable: true,
      removable: true,
      order: Math.max(...modules.map(m => m.order)) + 1,
      questions: [],
      isCustom: true,
    }
    setModules(prev => [...prev, newModule])
  }, [modules])

  const removeCustomModule = useCallback((moduleId) => {
    setModules(prev => prev.filter(m => m.id !== moduleId || !m.removable))
  }, [])

  // ──────────────────────────────────────────────────────────
  // Guardar
  // ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      const config = buildFormConfig({ intro, modules })
      await onSave?.(config)
    } finally {
      setSaving(false)
    }
  }

  const handleLoadTemplate = (templateConfig) => {
    setIntro(templateConfig.intro || DEFAULT_INTRO)
    setModules(templateConfig.modules || DEFAULT_MODULES)
    setShowTemplates(false)
  }

  // Módulos ordenados, el de consentimiento siempre al final
  const sortedModules = [...modules].sort((a, b) => a.order - b.order)

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Constructor de Formulario</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personalizá el formulario que recibirán tus estudiantes al ingresar
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            📋 Plantillas
          </button>
          <button
            onClick={() => onSendToStudent?.(buildFormConfig({ intro, modules }))}
            className="px-4 py-2 text-sm border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            📤 Enviar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'form', label: '✏️ Editar' },
          { id: 'preview', label: '👁 Vista previa' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'form' && (
        <div className="space-y-4">

          {/* Introducción */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">📝 Introducción</h2>
              <p className="text-xs text-gray-500">
                Texto que verá el estudiante al abrir el formulario. Soporta emojis y formato.
              </p>
            </div>
            <div className="p-4">
              <IntroEditor value={intro} onChange={setIntro} />
            </div>
          </div>

          {/* Módulos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">🧩 Módulos</h2>
              <button
                onClick={addCustomModule}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                + Agregar módulo personalizado
              </button>
            </div>

            {sortedModules.map((module, idx) => (
              <ModuleCard
                key={module.id}
                module={module}
                isFirst={idx === 0}
                isLast={idx === sortedModules.length - 1}
                onToggle={() => toggleModule(module.id)}
                onMoveUp={() => moveModule(module.id, 'up')}
                onMoveDown={() => moveModule(module.id, 'down')}
                onUpdate={(updated) => updateModule(module.id, updated)}
                onRemove={module.removable && module.isCustom
                  ? () => removeCustomModule(module.id)
                  : null
                }
              />
            ))}
          </div>

          {/* Consentimiento (fijo, solo informativo) */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">{CONSENT_MODULE.emoji}</span>
              <div>
                <p className="font-semibold text-amber-800 text-sm">
                  {CONSENT_MODULE.title} (obligatorio – no editable)
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Este módulo siempre aparecerá al final y no puede eliminarse. Incluye el consentimiento informado del estudiante.
                </p>
              </div>
              <span className="ml-auto text-amber-400">🔒</span>
            </div>
          </div>

          {/* Botón de guardar inferior */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Guardando...' : '💾 Guardar formulario'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center space-y-3">
          <p className="text-sm text-gray-500">
            Simulá cómo verá el formulario un alumno en su pantalla.
          </p>
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            👁 Abrir vista previa
          </button>
        </div>
      )}

      {/* ── OVERLAY FULL-SCREEN DE VISTA PREVIA ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          {/* Botón cerrar flotante */}
          <button
            onClick={() => setShowPreview(false)}
            className="fixed top-4 right-4 z-[60] flex items-center gap-1.5 bg-gray-900 text-white
                       text-xs font-medium px-3 py-2 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
          >
            ✕ Cerrar preview
          </button>

          <FormRenderer
            assignment={{ form_snapshot: buildFormConfig({ intro, modules }) }}
            studentId={null}
            onSubmit={async () => {}}
            onSaveDraft={null}
          />
        </div>
      )}

      {/* Modal de plantillas */}
      {showTemplates && (
        <TemplateManager
          templates={templates}
          currentConfig={buildFormConfig({ intro, modules })}
          onLoad={handleLoadTemplate}
          onClose={() => setShowTemplates(false)}
          onSaveNew={(name) => onSave?.({ name, config: buildFormConfig({ intro, modules }) })}
        />
      )}
    </div>
  )
}
