/**
 * PÁGINA ESTUDIANTE – RESPONDER UN FORMULARIO DE SEGUIMIENTO
 * Ruta: /student/form/:assignmentId
 *
 * Carga un assignment específico de follow_up y lo renderiza.
 * NO ejecuta process_intake_submission al terminar (esa función
 * solo aplica a intake — el SQL de v20 ya lo respeta también).
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import FormRenderer from '../../../intake-form/components/student/FormRenderer'

export default function FollowUpFormPage() {
  const { profile } = useAuth()
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  async function handleSaveDraft(responses) {
    if (!assignment) return
    await supabase
      .from('intake_form_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignment.id)

    await supabase
      .from('intake_form_submissions')
      .upsert({
        assignment_id: assignment.id,
        student_id: profile.id,
        coach_id: assignment.coach_id,
        form_snapshot: assignment.form_snapshot,
        responses,
      }, { onConflict: 'assignment_id' })
  }

  async function handleSubmit(responses) {
    if (!assignment) return

    await supabase
      .from('intake_form_submissions')
      .upsert({
        assignment_id: assignment.id,
        student_id: profile.id,
        coach_id: assignment.coach_id,
        form_snapshot: assignment.form_snapshot,
        responses,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id' })

    await supabase
      .from('intake_form_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)

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
          <h1 className="text-xl font-bold text-gray-900">Formulario no disponible</h1>
          <p className="text-gray-500 text-sm">
            Este formulario ya fue completado o no está disponible para vos.
          </p>
          <button
            onClick={() => navigate('/student/forms')}
            className="text-sm text-primary-600 hover:underline"
          >
            Ver mis formularios
          </button>
        </div>
      </div>
    )
  }

  return (
    <FormRenderer
      assignment={assignment}
      studentId={profile.id}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      onFinish={() => navigate('/student/forms')}
    />
  )
}
