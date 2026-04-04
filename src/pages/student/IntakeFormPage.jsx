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

export default function IntakeFormPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

    // Guardar submission final
    const { data: submission } = await supabase
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

    // Marcar asignación como completada
    await supabase
      .from('intake_form_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)

    // Generar perfil del estudiante (llamar a la función de Supabase)
    if (submission?.id) {
      await supabase.rpc('process_intake_submission', {
        submission_id: submission.id,
      })
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
    <FormRenderer
      assignment={assignment}
      studentId={profile.id}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
    />
  )
}
