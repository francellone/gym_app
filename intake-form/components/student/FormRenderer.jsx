/**
 * FORMULARIO DE INGRESO – VISTA ESTUDIANTE
 *
 * Renderiza el formulario completo asignado por el coach.
 * Gestiona:
 *   - Navegación paso a paso por módulos
 *   - Lógica condicional (muestra/oculta preguntas automáticamente)
 *   - Validación antes de avanzar al siguiente módulo
 *   - Guardado de progreso (draft) para retomar luego
 *   - Envío final al backend
 *
 * Props:
 *   - assignment: objeto { id, form_snapshot } de Supabase
 *   - studentId: string
 *   - onSubmit: fn(responses) → guarda en Supabase
 *   - onSaveDraft: fn(responses) → guarda borrador
 */

import { useState, useCallback, useMemo } from 'react'
import QuestionField from './QuestionField'
import {
  getVisibleQuestions,
  validateModule,
  validateForm,
  cleanHiddenResponses,
} from '../shared/conditionalLogic.js'

export default function FormRenderer({
  assignment,
  studentId,
  onSubmit,
  onSaveDraft,
}) {
  const config = assignment?.form_snapshot

  const allModules = useMemo(() => {
    if (!config) return []
    return [
      ...(config.modules || []).filter(m => m.enabled).sort((a, b) => a.order - b.order),
      config.consent,
    ].filter(Boolean)
  }, [config])

  const [currentStep, setCurrentStep] = useState(0) // 0 = intro
  const [responses, setResponses] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const totalSteps = allModules.length + 1 // +1 por intro
  const isIntro = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1
  const currentModule = isIntro ? null : allModules[currentStep - 1]

  // ──────────────────────────────────────────────────────────
  // Respuestas
  // ──────────────────────────────────────────────────────────

  const handleAnswer = useCallback((questionId, value) => {
    setResponses(prev => ({ ...prev, [questionId]: value }))
    // Limpiar error de esa pregunta al responder
    setErrors(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }, [])

  // ──────────────────────────────────────────────────────────
  // Navegación
  // ──────────────────────────────────────────────────────────

  const validateCurrentModule = useCallback(() => {
    if (!currentModule) return true
    const visible = getVisibleQuestions(currentModule.questions, responses)
    const { valid, missing } = validateModule(visible, responses)

    if (!valid) {
      const newErrors = {}
      missing.forEach(id => { newErrors[id] = 'Este campo es obligatorio' })
      setErrors(newErrors)
      return false
    }

    setErrors({})
    return true
  }, [currentModule, responses])

  const handleNext = () => {
    if (!validateCurrentModule()) {
      // Scroll al primer error
      const firstError = document.querySelector('[data-error="true"]')
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1)
      setErrors({})
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSaveDraft = async () => {
    const cleaned = cleanHiddenResponses(
      allModules.flatMap(m => m.questions),
      responses
    )
    await onSaveDraft?.(cleaned)
  }

  // ──────────────────────────────────────────────────────────
  // Envío final
  // ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validar todos los módulos antes de enviar
    const { valid, errorsByModule } = validateForm(allModules, responses)
    if (!valid) {
      // Ir al primer módulo con errores
      const firstErrorModuleIdx = allModules.findIndex(m => errorsByModule[m.id])
      if (firstErrorModuleIdx >= 0) {
        setCurrentStep(firstErrorModuleIdx + 1)
        const newErrors = {}
        errorsByModule[allModules[firstErrorModuleIdx].id].forEach(id => {
          newErrors[id] = 'Este campo es obligatorio'
        })
        setErrors(newErrors)
      }
      return
    }

    setSubmitting(true)
    try {
      const cleaned = cleanHiddenResponses(
        allModules.flatMap(m => m.questions),
        responses
      )
      await onSubmit?.(cleaned)
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  // ──────────────────────────────────────────────────────────
  // Pantalla de éxito
  // ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">¡Listo!</h1>
          <p className="text-gray-500">
            Tu formulario fue enviado. Tu coach lo revisará y se pondrá en contacto pronto.
          </p>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">No hay formulario disponible.</p>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────
  // Render principal
  // ──────────────────────────────────────────────────────────

  // Barra de progreso
  const progressPct = Math.round((currentStep / (totalSteps - 1)) * 100)

  // Preguntas visibles del módulo actual
  const visibleQuestions = currentModule
    ? getVisibleQuestions(currentModule.questions, responses)
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Barra de progreso */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-white shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {currentStep === 0 ? 'Inicio' : `${currentStep} / ${totalSteps - 1}`}
          </span>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-xl mx-auto px-4 pt-16 pb-32">

        {/* ── INTRO ─────────────────────────────────────── */}
        {isIntro && (
          <div className="py-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-5xl">📋</div>
              <h1 className="text-2xl font-bold text-gray-900">Formulario de ingreso</h1>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="prose prose-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {config.intro?.content || config.intro || ''}
              </div>
            </div>
          </div>
        )}

        {/* ── MÓDULO ────────────────────────────────────── */}
        {!isIntro && currentModule && (
          <div className="py-8 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-3xl">{currentModule.emoji}</span>
              <h2 className="text-xl font-bold text-gray-900">{currentModule.title}</h2>
            </div>

            <div className="space-y-6">
              {visibleQuestions.map(question => (
                <div
                  key={question.id}
                  data-error={!!errors[question.id]}
                  className={`bg-white rounded-xl border p-4 space-y-3 transition-all ${
                    errors[question.id]
                      ? 'border-red-300 shadow-sm'
                      : 'border-gray-100 shadow-sm'
                  }`}
                >
                  <label className="block">
                    <span className="text-sm font-medium text-gray-800 leading-snug">
                      {question.label}
                      {question.required && (
                        <span className="text-red-500 ml-1" title="Obligatorio">*</span>
                      )}
                    </span>
                  </label>

                  <QuestionField
                    question={question}
                    value={responses[question.id]}
                    onChange={handleAnswer}
                    error={!!errors[question.id]}
                  />

                  {errors[question.id] && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      ⚠ {errors[question.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── NAVEGACIÓN (fija al fondo) ───────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">

          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="px-5 py-3 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              ← Atrás
            </button>
          )}

          {!isLastStep ? (
            <button
              onClick={handleNext}
              className="flex-1 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              {isIntro ? '¡Empezar! →' : 'Continuar →'}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
            >
              {submitting ? 'Enviando...' : '✅ Enviar formulario'}
            </button>
          )}

          {!isIntro && !isLastStep && onSaveDraft && (
            <button
              onClick={handleSaveDraft}
              className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
            >
              Guardar borrador
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
