/**
 * MODAL – ENVIAR FORMULARIO A ALUMNO/S
 *
 * Permite al coach seleccionar uno o varios alumnos
 * para asignarles el formulario de ingreso actual.
 *
 * Props:
 *   - coachId:    string  — id del coach autenticado
 *   - formConfig: object  — config actual del formulario (form_snapshot)
 *   - templateId: string | null — id de la plantilla guardada (puede ser null)
 *   - onClose:    fn()    — cierra el modal
 *   - onSent:     fn()    — callback tras envío exitoso
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react'

export default function SendToStudentModal({ coachId, formConfig, templateId, onClose, onSent }) {
  const [students, setStudents]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch]         = useState('')
  const [sending, setSending]       = useState(false)
  const [results, setResults]       = useState(null) // { sent: [], skipped: [] }

  // ── Cargar alumnos del coach ─────────────────────────────
  useEffect(() => {
    async function loadStudents() {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'student')
        .order('name')
      setStudents(data || [])
      setLoading(false)
    }
    loadStudents()
  }, [coachId])

  // ── Selección ────────────────────────────────────────────
  const toggleStudent = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  )

  // ── Enviar ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedIds.length) return
    setSending(true)

    const sent    = []
    const skipped = []

    for (const studentId of selectedIds) {
      const { error } = await supabase
        .from('intake_form_assignments')
        .insert({
          coach_id:      coachId,
          student_id:    studentId,
          template_id:   templateId || null,
          form_snapshot: formConfig,
          status:        'pending',
        })

      const student = students.find(s => s.id === studentId)
      const label   = student?.name || student?.email || studentId

      if (error) {
        // El error más común es el unique index: ya tiene formulario activo
        skipped.push(label)
      } else {
        sent.push(label)
      }
    }

    setSending(false)
    setResults({ sent, skipped })
    if (sent.length > 0) onSent?.()
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">

        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Enviar formulario</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Seleccioná los alumnos que recibirán este formulario
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* ── PANTALLA DE RESULTADOS ── */}
        {results ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {results.sent.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-green-800">
                    Enviado a {results.sent.length} alumno{results.sent.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="text-xs text-green-700 space-y-0.5 pl-5 list-disc">
                  {results.sent.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
            )}

            {results.skipped.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-amber-800">
                    {results.skipped.length} omitido{results.skipped.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-amber-600 mb-2">
                  Ya tienen un formulario activo sin completar.
                </p>
                <ul className="text-xs text-amber-700 space-y-0.5 pl-5 list-disc">
                  {results.skipped.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              Cerrar
            </button>
          </div>

        ) : (
          <>
            {/* Buscador */}
            <div className="px-4 py-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Buscar alumno..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>

            {/* Lista de alumnos */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  {search ? 'Sin coincidencias' : 'Todavía no tenés alumnos'}
                </p>
              ) : (
                filteredStudents.map(student => {
                  const selected = selectedIds.includes(student.id)
                  return (
                    <button
                      key={student.id}
                      onClick={() => toggleStudent(student.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 transition-colors text-left ${
                        selected
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      {/* Checkbox custom */}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                                       flex-shrink-0 transition-colors ${
                        selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8"
                                  strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {student.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{student.email}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={handleSend}
                disabled={sending || selectedIds.length === 0}
                className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl
                           hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-colors flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    {selectedIds.length > 0
                      ? `Enviar a ${selectedIds.length} alumno${selectedIds.length !== 1 ? 's' : ''}`
                      : 'Seleccioná un alumno'
                    }
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
