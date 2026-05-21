/**
 * PÁGINA ESTUDIANTE – LISTADO DE FORMULARIOS PENDIENTES
 * Ruta: /student/forms
 *
 * Muestra todos los formularios que el alumno tiene pendientes
 * (intake + follow_up) y los completados recientemente.
 *
 * Antes de cargar la lista, llama release_due_forms() para flippar
 * los 'scheduled' que ya pasaron su fecha → 'pending'.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { FileText, ChevronRight, CheckCircle, Clock } from 'lucide-react'

export default function FormsListPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    load()
  }, [profile?.id])

  async function load() {
    setLoading(true)

    // Liberar los programados que ya vencieron (idempotente)
    try {
      await supabase.rpc('release_due_forms')
    } catch (e) {
      // No es crítico si falla — sigue intentando cargar
      console.warn('[FormsListPage] release_due_forms', e)
    }

    const { data } = await supabase
      .from('intake_form_assignments')
      .select('*, intake_form_templates(name)')
      .eq('student_id', profile.id)
      .order('sent_at', { ascending: false })

    const all = data || []
    setPending(all.filter(a => a.status === 'pending' || a.status === 'in_progress'))
    setCompleted(all.filter(a => a.status === 'completed').slice(0, 10))
    setLoading(false)
  }

  function openForm(assignment) {
    if (assignment.form_kind === 'intake') {
      navigate('/student/intake')
    } else {
      navigate(`/student/form/${assignment.id}`)
    }
  }

  function badgeFor(assignment) {
    if (assignment.form_kind === 'intake') {
      return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Alta</span>
    }
    return <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Seguimiento</span>
  }

  function templateNameOf(assignment) {
    return assignment.intake_form_templates?.name
      || (assignment.form_kind === 'intake' ? 'Formulario de ingreso' : 'Formulario de seguimiento')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Formularios</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pending.length === 0
            ? 'No tenés formularios pendientes'
            : `${pending.length} pendiente${pending.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Pendientes */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map(a => (
            <button
              key={a.id}
              onClick={() => openForm(a)}
              className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{templateNameOf(a)}</p>
                  {badgeFor(a)}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  {a.status === 'in_progress' ? (
                    <><Clock size={11} /> En progreso</>
                  ) : (
                    'Pendiente de respuesta'
                  )}
                </p>
              </div>
              <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Completados (referencia) */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">Completados</h2>
          <div className="space-y-1.5">
            {completed.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{templateNameOf(a)}</span>
                {badgeFor(a)}
                {a.completed_at && (
                  <span className="text-xs text-gray-400">
                    {new Date(a.completed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && completed.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <FileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No tenés formularios todavía. Cuando tu coach te envíe alguno, aparecerá acá.</p>
        </div>
      )}
    </div>
  )
}
