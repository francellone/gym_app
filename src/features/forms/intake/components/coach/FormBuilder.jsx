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
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Eye, Files, Lock, Pencil, Save, Send, X } from 'lucide-react'
import ModuleCard from './ModuleCard'
import TemplateManager from './TemplateManager'
import IntroEditor from './IntroEditor'
import FormRenderer from '../student/FormRenderer'
import { useCoachFormLanguages } from '@/features/forms/hooks/useCoachFormLanguages'
import { countVisibleQuestions } from '../../schema/resolve-form-language.js'
import {
  buildFormConfig,
  buildFollowUpFormConfig,
  DEFAULT_MODULES,
  DEFAULT_INTRO,
  CONSENT_MODULE,
  FOLLOW_UP_INTRO,
  FOLLOW_UP_BLANK_MODULE,
} from '../../schema/default-form.js'

const FORM_LANGUAGES = ['es', 'en']

export default function FormBuilder({
  coachId: _coachId,
  initialConfig,
  templates = [],
  onSave,
  onSendToStudent,
  formKind = 'intake', // 'intake' | 'follow_up'
}) {
  const { t } = useTranslation()
  const isFollowUp = formKind === 'follow_up'

  // Modo bilingüe (docs/plan-formularios-bilingues.md): habilita los campos
  // de traducción EN en intro/módulos/preguntas y el preview en inglés.
  const { bilingual } = useCoachFormLanguages()

  // Para follow_up usamos defaults distintos (intro genérico + módulo en blanco, sin consent)
  const fallbackIntro = isFollowUp ? FOLLOW_UP_INTRO : DEFAULT_INTRO
  const fallbackModules = isFollowUp ? [FOLLOW_UP_BLANK_MODULE] : DEFAULT_MODULES

  const [intro, setIntro] = useState(initialConfig?.intro || fallbackIntro)
  const [modules, setModules] = useState(initialConfig?.modules || fallbackModules)
  const [saving, setSaving] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [activeTab, setActiveTab] = useState('form') // 'form' | 'preview'
  const [showPreview, setShowPreview] = useState(false)
  const [previewLang, setPreviewLang] = useState('es') // idioma del preview (modo bilingüe)

  // ──────────────────────────────────────────────────────────
  // Handlers de módulos
  // ──────────────────────────────────────────────────────────

  const toggleModule = useCallback((moduleId) => {
    setModules((prev) =>
      prev.map((m) => (m.id === moduleId && m.removable ? { ...m, enabled: !m.enabled } : m))
    )
  }, [])

  const moveModule = useCallback((moduleId, direction) => {
    setModules((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex((m) => m.id === moduleId)
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
    setModules((prev) => prev.map((m) => (m.id === moduleId ? updatedModule : m)))
  }, [])

  const addCustomModule = useCallback(() => {
    const newModule = {
      id: `modulo_custom_${Date.now()}`,
      title: 'Nuevo módulo', // valor inicial del contenido (canónico en español)
      emoji: '📌',
      enabled: true,
      editable: true,
      removable: true,
      order: Math.max(...modules.map((m) => m.order)) + 1,
      questions: [],
      isCustom: true,
    }
    setModules((prev) => [...prev, newModule])
  }, [modules])

  const removeCustomModule = useCallback((moduleId) => {
    setModules((prev) => prev.filter((m) => m.id !== moduleId || !m.removable))
  }, [])

  // ──────────────────────────────────────────────────────────
  // Guardar
  // ──────────────────────────────────────────────────────────

  // Construye el config actual preservando name_i18n del config cargado
  // (buildFormConfig no lo conoce y lo pisaría — detectado en el test del
  // 2026-07-06). FollowUpFormBuilderPage lo re-escribe con su propio campo.
  const buildCurrentConfig = () => {
    const config = isFollowUp
      ? buildFollowUpFormConfig({ intro, modules })
      : buildFormConfig({ intro, modules })
    return initialConfig?.name_i18n ? { ...config, name_i18n: initialConfig.name_i18n } : config
  }

  // Aviso temprano (el bug de agosto 2026 se coló por acá): si TODAS las
  // preguntas quedan marcadas para un solo idioma, a las alumnas del otro el
  // formulario les llega SIN NINGÚN PASO y no lo pueden completar. Se calcula
  // siempre, no solo en modo bilingüe: un `hidden_for` viejo sigue filtrando
  // aunque hoy el modo esté apagado.
  // Solo avisamos si el formulario TIENE preguntas y aun así queda vacío para
  // un idioma: un formulario recién creado (todavía sin preguntas) no necesita
  // un cartel rojo, está en construcción.
  const currentConfig = buildCurrentConfig()
  const totalQuestions = modules
    .filter((m) => m.enabled)
    .reduce((sum, m) => sum + (m.questions?.length || 0), 0)
  const emptyLangs =
    totalQuestions > 0
      ? FORM_LANGUAGES.filter((lang) => countVisibleQuestions(currentConfig, lang) === 0)
      : []

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave?.(buildCurrentConfig())
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
          <h1 className="text-2xl font-bold text-gray-900">
            {isFollowUp
              ? t('coach.forms.builder.titleFollowUp')
              : t('coach.forms.builder.titleIntake')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isFollowUp
              ? t('coach.forms.builder.subtitleFollowUp')
              : t('coach.forms.builder.subtitleIntake')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="btn-secondary !py-2 text-sm inline-flex items-center gap-1.5"
          >
            <Files size={16} /> {t('coach.forms.builder.templates')}
          </button>
          <button
            onClick={() => onSendToStudent?.(buildCurrentConfig())}
            className="btn-secondary !py-2 text-sm inline-flex items-center gap-1.5"
          >
            <Send size={16} /> {t('coach.forms.builder.send')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary !py-2 text-sm inline-flex items-center gap-1.5"
          >
            <Save size={16} />{' '}
            {saving ? t('coach.forms.builder.saving') : t('coach.forms.builder.save')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'form', label: t('coach.forms.builder.tabEdit'), Icon: Pencil },
          { id: 'preview', label: t('coach.forms.builder.tabPreview'), Icon: Eye },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-texto2 hover:text-tinta'
            }`}
          >
            <tab.Icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {emptyLangs.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              {t('coach.forms.builder.emptyLangTitle', {
                langs: emptyLangs
                  .map((l) => t(`coach.forms.builder.lang.${l}`, { defaultValue: l }))
                  .join(t('coach.forms.builder.langJoin')),
              })}
            </p>
            <p className="text-xs mt-1 text-amber-800">
              {t('coach.forms.builder.emptyLangBody', {
                visibilityLabel: t('coach.forms.question.visibilityLabel'),
                visibilityBoth: t('coach.forms.question.visibilityBoth'),
              })}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'form' && (
        <div className="space-y-4">
          {/* Introducción */}
          <div className="card !p-0 overflow-hidden">
            <div className="bg-durazno-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">{t('coach.forms.builder.introTitle')}</h2>
              <p className="text-xs text-gray-500">{t('coach.forms.builder.introHint')}</p>
            </div>
            <div className="p-4">
              <IntroEditor value={intro} onChange={setIntro} bilingual={bilingual} />
            </div>
          </div>

          {/* Módulos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                {t('coach.forms.builder.modulesTitle')}
              </h2>
              <button
                onClick={addCustomModule}
                className="text-xs font-medium text-primary-700 hover:text-primary-800 flex items-center gap-1"
              >
                {t('coach.forms.builder.addModule')}
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
                onRemove={
                  module.removable && module.isCustom ? () => removeCustomModule(module.id) : null
                }
                bilingual={bilingual}
              />
            ))}
          </div>

          {/* Consentimiento (fijo, solo informativo) — solo en formularios de alta */}
          {!isFollowUp && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl">{CONSENT_MODULE.emoji}</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">
                    {t('coach.forms.builder.consentTitle', { title: CONSENT_MODULE.title })}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    {t('coach.forms.builder.consentBody')}
                  </p>
                </div>
                <Lock size={16} className="ml-auto text-amber-600 flex-shrink-0" />
              </div>
            </div>
          )}

          {/* Botón de guardar inferior */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Save size={18} />{' '}
              {saving ? t('coach.forms.builder.saving') : t('coach.forms.builder.saveForm')}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center space-y-3">
          <p className="text-sm text-gray-500">{t('coach.forms.builder.previewHint')}</p>
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-linea text-tinta text-sm font-medium rounded-boton hover:bg-durazno-50 transition-colors"
          >
            <Eye size={16} /> {t('coach.forms.builder.openPreview')}
          </button>
        </div>
      )}

      {/* ── OVERLAY FULL-SCREEN DE VISTA PREVIA ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          {/* Botón cerrar flotante */}
          <button
            onClick={() => setShowPreview(false)}
            className="fixed top-4 right-4 z-[60] flex items-center gap-1.5 bg-white border border-linea text-tinta
                       text-xs font-medium px-3 py-2 rounded-full shadow-flotante hover:bg-durazno-50 transition-colors"
          >
            <X size={14} /> {t('coach.forms.builder.closePreview')}
          </button>

          {/* Selector de idioma del preview (modo bilingüe) */}
          {bilingual && (
            <div className="fixed top-4 left-4 z-[60] flex rounded-full border border-linea shadow-flotante overflow-hidden text-xs font-medium">
              {[
                { code: 'es', label: '🇪🇸 Español' },
                { code: 'en', label: '🇬🇧 English' },
              ].map((l) => (
                <button
                  key={l.code}
                  onClick={() => setPreviewLang(l.code)}
                  className={`px-3 py-2 transition-colors ${
                    previewLang === l.code
                      ? 'bg-durazno-50 text-primary-700'
                      : 'bg-white text-texto2 hover:bg-durazno-50'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          <FormRenderer
            key={previewLang} // reinicia el paso/respuestas al cambiar idioma
            assignment={{
              form_snapshot: buildCurrentConfig(),
              form_kind: formKind,
            }}
            studentId={null}
            onSubmit={async () => {}}
            onSaveDraft={null}
            previewLanguage={bilingual ? previewLang : undefined}
          />
        </div>
      )}

      {/* Modal de plantillas */}
      {showTemplates && (
        <TemplateManager
          templates={templates}
          currentConfig={buildCurrentConfig()}
          onLoad={handleLoadTemplate}
          onClose={() => setShowTemplates(false)}
          onSaveNew={(name) => onSave?.({ name, config: buildCurrentConfig() })}
        />
      )}
    </div>
  )
}
