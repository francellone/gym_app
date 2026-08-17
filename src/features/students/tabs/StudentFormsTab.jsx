/**
 * Tab "Formularios" del detalle de alumno.
 *
 * Lista todos los formularios de seguimiento (form_kind='follow_up')
 * asignados al alumno + sus respuestas. Click → modal con respuestas.
 *
 * El intake se sigue mostrando aparte en la tab "Info" — esto es
 * solo para los formularios de seguimiento.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, Clock, Calendar, FileText, X, AlertCircle, Trash2 } from 'lucide-react'

export default function StudentFormsTab({ studentId }) {
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState({}) // { assignment_id: submission }
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null) // { assignment, submission }
  const [cancelling, setCancelling] = useState(null) // id del envío que se está cancelando

  useEffect(() => {
    if (!studentId) return
    load()
  }, [studentId])

  async function load() {
    setLoading(true)
    const [aRes, sRes] = await Promise.all([
      supabase
        .from('intake_form_assignments')
        .select('*, intake_form_templates(name)')
        .eq('student_id', studentId)
        .eq('form_kind', 'follow_up')
        .order('sent_at', { ascending: false }),
      supabase
        .from('intake_form_submissions')
        .select('*')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false }),
    ])

    setAssignments(aRes.data || [])
    const subMap = {}
    ;(sRes.data || []).forEach((s) => {
      subMap[s.assignment_id] = s
    })
    setSubmissions(subMap)
    setLoading(false)
  }

  /**
   * Cancelar un envío que todavía no fue respondido.
   *
   * Hasta agosto 2026 no había forma de sacar un formulario mal enviado: si te
   * equivocabas, le quedaba ahí a la alumna para siempre y solo podías mandarle
   * otro encima. Borrar la fila hace cascade sobre el borrador (FK ON DELETE
   * CASCADE), así que no quedan huérfanos.
   */
  async function handleCancel(a) {
    const started = a.status === 'in_progress' || !!submissions[a.id]
    const message = started
      ? `Esta persona ya empezó a responder "${nameOf(a)}". Si cancelás el envío se borra junto con lo que haya completado. ¿Seguro?`
      : `¿Cancelar el envío de "${nameOf(a)}"? Le va a desaparecer de su lista de formularios.`
    if (!confirm(message)) return

    setCancelling(a.id)
    // Pedimos las filas borradas: un DELETE que la RLS rechaza NO tira error,
    // simplemente no borra nada (mismo caso que ejercicios, julio 2026).
    const { data, error } = await supabase
      .from('intake_form_assignments')
      .delete()
      .eq('id', a.id)
      .select('id')
    setCancelling(null)

    if (error || !data?.length) {
      console.error('No se pudo cancelar el envío', error)
      alert('No se pudo cancelar el envío. Probá de nuevo; si sigue pasando, avisá.')
      return
    }
    load()
  }

  function statusBadge(status) {
    const map = {
      scheduled: { label: 'Programado', cls: 'bg-blue-100 text-blue-800', Icon: Calendar },
      pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800', Icon: AlertCircle },
      in_progress: { label: 'En progreso', cls: 'bg-yellow-100 text-yellow-800', Icon: Clock },
      completed: { label: 'Respondido', cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
    }
    const info = map[status] || map.pending
    const Icon = info.Icon
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${info.cls}`}
      >
        <Icon size={11} /> {info.label}
      </span>
    )
  }

  function nameOf(a) {
    return a.intake_form_templates?.name || a.form_snapshot?.name || 'Formulario de seguimiento'
  }

  function triggerLabel(a) {
    if (a.trigger_type === 'manual') return 'Envío manual'
    if (a.trigger_type === 'on_week') return `Semana ${a.trigger_config?.week ?? '?'} del plan`
    if (a.trigger_type === 'on_plan_end') return 'Cierre del plan'
    return ''
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="card text-center py-10 text-gray-400">
        <FileText size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm">Todavía no le enviaste formularios de seguimiento.</p>
        <p className="text-xs mt-1">
          Andá a "Seguimiento" en el menú lateral para crear y enviar uno.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {assignments.map((a) => {
        const sub = submissions[a.id]
        const canCancel = a.status !== 'completed'
        return (
          <div
            key={a.id}
            className={`bg-white border border-gray-200 rounded-xl transition-all ${
              sub ? 'hover:border-blue-300 hover:shadow-sm' : ''
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <button
                type="button"
                onClick={() => (sub ? setViewing({ assignment: a, submission: sub }) : null)}
                disabled={!sub}
                className={`min-w-0 flex-1 text-left ${
                  sub ? 'cursor-pointer' : 'opacity-75 cursor-default'
                }`}
              >
                <p className="font-medium text-gray-900 truncate">{nameOf(a)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{triggerLabel(a)}</p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                  {statusBadge(a.status)}
                  {a.scheduled_for && a.status === 'scheduled' && (
                    <span>· {new Date(a.scheduled_for).toLocaleDateString()}</span>
                  )}
                  {a.completed_at && <span>· {new Date(a.completed_at).toLocaleDateString()}</span>}
                </div>
              </button>

              {canCancel && (
                <button
                  type="button"
                  onClick={() => handleCancel(a)}
                  disabled={cancelling === a.id}
                  title="Cancelar este envío"
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={12} />
                  {cancelling === a.id ? 'Cancelando...' : 'Cancelar'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Modal de respuestas */}
      {viewing && (
        <ResponsesModal
          assignment={viewing.assignment}
          submission={viewing.submission}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Modal: ver respuestas una por una
// ─────────────────────────────────────────────────────────
function ResponsesModal({ assignment, submission, onClose }) {
  const config = submission.form_snapshot
  const responses = submission.responses || {}

  // Aplanar todas las preguntas para mostrar pregunta + respuesta
  const allQuestions = (config?.modules || []).flatMap((m) =>
    (m.questions || []).map((q) => ({ ...q, moduleTitle: m.title }))
  )

  function renderValue(q, value) {
    if (value === undefined || value === null || value === '') {
      return <span className="text-gray-400 italic">Sin respuesta</span>
    }
    if (q.type === 'boolean') {
      return value === true || value === 'true' || value === 'si' ? 'Sí' : 'No'
    }
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    return String(value)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base truncate">
              {assignment.intake_form_templates?.name || 'Formulario'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Respondido el {new Date(submission.submitted_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {allQuestions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Este formulario no tiene preguntas.
            </p>
          ) : (
            allQuestions.map((q) => (
              <div key={q.id} className="border-b border-gray-100 pb-3 last:border-0">
                <p className="text-xs text-gray-400 mb-1">{q.moduleTitle}</p>
                <p className="text-sm font-medium text-gray-800 mb-1.5">{q.label}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {renderValue(q, responses[q.id])}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
