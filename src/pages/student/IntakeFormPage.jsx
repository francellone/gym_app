/**
 * PÁGINA ESTUDIANTE – FORMULARIO DE INGRESO
 * Ruta: /student/intake
 *
 * Carga la asignación pendiente del estudiante y renderiza el formulario.
 * Si no hay asignación pendiente, muestra un mensaje apropiado.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import FormRenderer from '../../../intake-form/components/student/FormRenderer'

// Traduce errores conocidos del back en mensajes accionables para el alumno.
// 23514 + profiles_lesiones_requires_detail viene del CHECK agregado en el
// handoff 2.6: si tiene_lesiones=true, la BD exige descripcion_lesiones no
// vacío o patologias con algo distinto de 'Ninguna'.
function intakeFriendlyError(err) {
  if (!err) return null
  const code = err.code || err?.details?.code
  const msg = err.message || ''
  if (code === '23514' && /profiles_lesiones_requires_detail/i.test(msg)) {
    return 'Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.'
  }
  return msg || 'No pudimos enviar el formulario. Intentá de nuevo en un momento.'
}

export default function IntakeFormPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // ── Cargar asignación pendiente ──────────────────────────
  useEffect(() => {
    if (!profile?.id) return

    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('intake_form_assignments')
          .select('*')
          .eq('student_id', profile.id)
          .in('status', ['pending', 'in_progress'])
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data) {
          setAssignment(data)
        } else {
          setNotFound(true)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [profile?.id])

  // ── Guardar borrador ─────────────────────────────────────
  const handleSaveDraft = async (responses) => {
    if (!assignment) return
    await supabase
      .from('intake_form_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignment.id)

    // Guardar respuestas parciales en una submission temporal
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

  // ── Envío final ──────────────────────────────────────────
  const handleSubmit = async (responses) => {
    if (!assignment) return
    setSubmitError(null)

    // Guardar submission final
    const { data: submission, error: submissionError } = await supabase
      .from('intake_form_submissions')
      .upsert({
        assignment_id: assignment.id,
        student_id: profile.id,
        coach_id: assignment.coach_id,
        form_snapshot: assignment.form_snapshot,
        responses,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id' })
      .select()
      .single()

    if (submissionError) {
      setSubmitError(intakeFriendlyError(submissionError))
      throw submissionError
    }

    // Marcar asignación como completada
    const { error: assignmentError } = await supabase
      .from('intake_form_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)

    if (assignmentError) {
      setSubmitError(intakeFriendlyError(assignmentError))
      throw assignmentError
    }

    // Generar perfil del estudiante (llamar a la función de Supabase).
    // Si la respuesta violase el CHECK profiles_lesiones_requires_detail
    // (no debería pasar tras la validación cliente, pero el back igualmente
    // defiende), traducimos el código a un mensaje accionable y lo
    // surfaceamos al alumno sin dejarlo pensando que envió OK.
    if (submission?.id) {
      const { error: rpcError } = await supabase.rpc('process_intake_submission', {
        submission_id: submission.id,
      })
      if (rpcError) {
        setSubmitError(intakeFriendlyError(rpcError))
        throw rpcError
      }
    }
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Sin formulario pendiente ─────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-gray-900">Sin formulario pendiente</h1>
          <p className="text-gray-500 text-sm">
            Tu coach aún no te envió el formulario de ingreso. Cuando lo recibas aparecerá aquí.
          </p>
          <button
            onClick={() => navigate('/student')}
            className="text-sm text-primary-600 hover:underline"
          >
            Volver al inicio
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
          <p className="text-xs text-rose-800 flex-1 leading-relaxed">
            {submitError}
          </p>
          <button
            onClick={() => setSubmitError(null)}
            className="text-rose-500 hover:text-rose-700 flex-shrink-0"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
      <FormRenderer
        assignment={assignment}
        studentId={profile.id}
        onSubmit={handleSubmit}
        onSaveDraft={handleSaveDraft}
        onFinish={() => navigate('/student')}
      />
    </>
  )
}
