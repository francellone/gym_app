import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Check, X } from 'lucide-react'
import { assignTemplateToStudent } from '@/features/plans/assignmentHelpers'

// ─────────────────────────────────────────────────────────────
// AssignEvalToStudentModal — Bug 1 doc 32 (2026-05-26)
// Modal de asignación de un eval template a un alumno. Carga
// la lista de alumnos al abrir (lazy) y llama a la RPC
// assign_template_to_student vía el helper compartido.
//
// Usado desde EvaluationsPage (botón en card) y EvaluationDetailPage
// (botón en header — Q9 backlog + iteración 2 del 26/05 PM).
// ─────────────────────────────────────────────────────────────
export default function AssignEvalToStudentModal({ plan, onClose, onDone }) {
  const [students, setStudents] = useState([])
  // v40: personas inactivas ocultas por defecto en el selector
  const [showInactive, setShowInactive] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetchStudents() {
      try {
        const { data, error: e } = await supabase
          .from('profiles')
          .select('id, name, email, active')
          .eq('role', 'student')
          .order('name')
        if (e) throw e
        if (!cancelled) setStudents(data || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Error cargando alumnos')
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    }
    fetchStudents()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAssign() {
    if (!selectedStudentId) return
    setAssignLoading(true)
    setError(null)
    try {
      await assignTemplateToStudent(supabase, {
        templateId: plan.id,
        studentId: selectedStudentId,
        startDate: new Date().toISOString().slice(0, 10),
      })
      onDone()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al asignar la evaluación')
    } finally {
      setAssignLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">Asignar evaluación</h3>
            <p className="text-sm text-gray-600 mt-0.5 break-words">{plan.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            type="button"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="label text-xs">Alumno</label>
          {loadingStudents ? (
            <div className="h-10 bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-gray-500">No hay alumnos cargados todavía.</p>
          ) : (
            <select
              className="input text-sm"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              <option value="">— Seleccionar alumno —</option>
              {students
                .filter(
                  (s) => showInactive || s.active !== false || s.id === selectedStudentId
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.email}
                    {s.active === false ? ' (inactivo)' : ''}
                  </option>
                ))}
            </select>
          )}
          {students.some((s) => s.active === false) && (
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Mostrar personas inactivas
            </label>
          )}
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
            {error}
          </p>
        )}

        <p className="text-xs text-gray-500">
          Para vincularla a un plan del alumno (opcional), usá la pestaña Evaluaciones dentro del
          perfil.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={assignLoading}
            className="btn-secondary flex-1 text-sm"
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedStudentId || assignLoading || loadingStudents}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
            type="button"
          >
            {assignLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check size={14} /> Asignar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
