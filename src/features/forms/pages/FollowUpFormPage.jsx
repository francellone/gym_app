/**
 * PÁGINA ESTUDIANTE – RESPONDER UN FORMULARIO DE SEGUIMIENTO
 * Ruta: /student/form/:assignmentId
 *
 * Carga un assignment específico de follow_up y lo renderiza.
 * NO ejecuta process_intake_submission al terminar (esa función
 * solo aplica a intake — el SQL de v20 ya lo respeta también).
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import FormRenderer from '@/features/forms/intake/components/student/FormRenderer'

// Respuestas de un borrador guardado en la base (si la persona ya empezó).
async function loadDraftResponses(assignmentId) {
  const { data } = await supabase
    .from('intake_form_submissions')
    .select('responses')
    .eq('assignment_id', assignmentId)
    .maybeSingle()
  return data?.responses || null
}

export default function FollowUpFormPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [initialResponses, setInitialResponses] = useState(null)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    if (!profile?.id || !assignmentId) return

    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('intake_form_assignments')
          .select('*, intake_form_templates(name)')
          .eq('id', assignmentId)
          .eq('student_id', profile.id)
          .maybeSingle()

        if (data && (data.status === 'pending' || data.status === 'in_progress')) {
          if (data.status === 'in_progress') setInitialResponses(await loadDraftResponses(data.id))
          setAssignment({
            ...data,
            template_name: data.intake_form_templates?.name,
          })
        } else {
          setNotFound(true)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [profile?.id, assignmentId])

  // 2026-10-14: antes se ignoraban los errores de la base, así que un envío
  // fallido mostraba igual "¡Listo!" y la persona creía haber terminado.
  async function handleSaveDraft(responses) {
    if (!assignment) return
    const { error: statusError } = await supabase
      .from('intake_form_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignment.id)
    if (statusError) throw statusError

    const { error } = await supabase.from('intake_form_submissions').upsert(
      {
        assignment_id: assignment.id,
        student_id: profile.id,
        coach_id: assignment.coach_id,
        form_snapshot: assignment.form_snapshot,
        responses,
      },
      { onConflict: 'assignment_id' }
    )
    if (error) throw error
  }

  async function handleSubmit(responses) {
    if (!assignment) return
    setSubmitError(null)

    const { error: submissionError } = await supabase.from('intake_form_submissions').upsert(
      {
        assignment_id: assignment.id,
        student_id: profile.id,
        coach_id: assignment.coach_id,
        form_snapshot: assignment.form_snapshot,
        responses,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id' }
    )
    if (submissionError) {
      setSubmitError(t('forms.submitFallbackError'))
      throw submissionError
    }

    const { error: assignmentError } = await supabase
      .from('intake_form_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
    if (assignmentError) {
      setSubmitError(t('forms.submitFallbackError'))
      throw assignmentError
    }

    // No llamamos process_intake_submission — la función de v20 ya
    // detecta form_kind='follow_up' y returnea sin hacer nada,
    // pero igualmente la salteamos para ahorrar la llamada.
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-gray-900">{t('forms.notAvailableTitle')}</h1>
          <p className="text-gray-500 text-sm">{t('forms.notAvailableBody')}</p>
          <button
            onClick={() => navigate('/student/forms')}
            className="text-sm text-primary-600 hover:underline"
          >
            {t('forms.seeMyForms')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {submitError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-1.5rem)] bg-rose-50 border-2 border-rose-200 rounded-xl p-3 shadow-lg flex items-start gap-2">
          <span className="text-rose-500 text-lg leading-none">⚠</span>
          <p className="text-xs text-rose-800 flex-1 leading-relaxed">{submitError}</p>
          <button
            onClick={() => setSubmitError(null)}
            className="text-rose-500 hover:text-rose-700 flex-shrink-0"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
      )}
      <FormRenderer
        assignment={assignment}
        studentId={profile.id}
        initialResponses={initialResponses}
        onSubmit={handleSubmit}
        onSaveDraft={handleSaveDraft}
        onFinish={() => navigate('/student/forms')}
      />
    </>
  )
}
