/**
 * MODAL – ENVIAR FORMULARIO A ALUMNO/S
 *
 * Soporta dos modos según prop formKind:
 *   - 'intake' (default): mismo flujo de siempre — selecciona alumnos y envía.
 *   - 'follow_up': agrega selector de trigger (manual / on_week / on_plan_end)
 *     y, si el trigger requiere plan, ofrece elegir el plan activo del
 *     alumno (si tiene >1 activos, pide elegir uno).
 *
 * Props:
 *   - coachId:      string
 *   - formConfig:   object — config del form (form_snapshot)
 *   - templateId:   string | null
 *   - formKind:     'intake' | 'follow_up'
 *   - templateName: string (solo follow_up, para mostrar en header)
 *   - onClose:      fn()
 *   - onSent:       fn()
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { countVisibleQuestions } from '../features/forms/intake/schema/resolve-form-language.js'
import { X, Send, CheckCircle, AlertCircle, Calendar, ChevronRight } from 'lucide-react'

const LANG_LABEL = { es: 'español', en: 'inglés' }

const TRIGGER_OPTIONS = [
  { id: 'manual', label: 'Ahora mismo', hint: 'Se envía al instante' },
  { id: 'on_week', label: 'En la semana N del plan', hint: 'Programado al cumplirse esa semana' },
  {
    id: 'on_plan_end',
    label: 'Al cierre del plan',
    hint: 'Se envía cuando termine el plan asignado',
  },
]

export default function SendToStudentModal({
  coachId,
  formConfig,
  templateId,
  formKind = 'intake',
  templateName,
  onClose,
  onSent,
}) {
  const isFollowUp = formKind === 'follow_up'

  // ── Estado general ──
  const [step, setStep] = useState(isFollowUp ? 'trigger' : 'students')
  // steps follow_up: 'trigger' → 'students' → 'plan_disambiguation' (si aplica) → 'results'
  // steps intake: 'students' → 'results'

  const [students, setStudents] = useState([])
  const [plansByStudent, setPlansByStudent] = useState({}) // { studentId: [plan_assignment, ...] }
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  // ── Trigger config (solo follow_up) ──
  const [triggerType, setTriggerType] = useState('manual')
  const [weekN, setWeekN] = useState(4) // default razonable

  // ── Plan disambiguation: cuando un alumno tiene >1 activo ──
  // { studentId: planAssignmentId } — el coach elige uno por alumno
  const [planChoice, setPlanChoice] = useState({})

  // ── Cargar alumnos del coach ─────────────────────────────
  useEffect(() => {
    async function loadStudents() {
      setLoading(true)
      const { data: studs } = await supabase
        .from('profiles')
        .select('id, name, email, language')
        .eq('role', 'student')
        .order('name')

      setStudents(studs || [])

      // Si es follow_up con trigger relativo al plan, también cargar plan_assignments activos
      if (isFollowUp && studs?.length) {
        const ids = studs.map((s) => s.id)
        const { data: pas } = await supabase
          .from('plan_assignments')
          .select('id, plan_id, student_id, start_date, end_date, active, plans:plan_id(id, title)')
          .in('student_id', ids)
          .eq('active', true)

        const map = {}
        ;(pas || []).forEach((pa) => {
          if (!map[pa.student_id]) map[pa.student_id] = []
          map[pa.student_id].push(pa)
        })
        setPlansByStudent(map)
      }

      setLoading(false)
    }
    loadStudents()
  }, [coachId, isFollowUp])

  // ── Helpers ─────────────────────────────────────────────
  const triggerNeedsPlan =
    isFollowUp && (triggerType === 'on_week' || triggerType === 'on_plan_end')

  // Preguntas visibles por idioma (se calcula una vez por idioma, no por alumno).
  const countByLang = useMemo(() => {
    const cache = {}
    for (const lang of new Set(students.map((s) => s.language || 'es'))) {
      cache[lang] = countVisibleQuestions(formConfig, lang)
    }
    return cache
  }, [students, formConfig])

  function isEmptyFor(student) {
    return (countByLang[student?.language || 'es'] ?? 0) === 0
  }

  // Idiomas en los que este formulario quedaría vacío (para el aviso de arriba).
  const emptyLangs = Object.keys(countByLang).filter((l) => countByLang[l] === 0)

  function toggleStudent(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function selectAllVisible() {
    const visible = filteredStudents
      .filter((s) => !triggerNeedsPlan || (plansByStudent[s.id]?.length || 0) > 0)
      .filter((s) => !isEmptyFor(s))
      .map((s) => s.id)
    setSelectedIds(visible)
  }

  const filteredStudents = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
  )

  // Estudiantes que necesitan resolver plan (más de 1 activo) y están seleccionados
  const studentsNeedingPlanChoice = triggerNeedsPlan
    ? selectedIds.filter((sid) => (plansByStudent[sid]?.length || 0) > 1 && !planChoice[sid])
    : []

  // ── Calcular scheduled_for según trigger ─────────────────
  function computeScheduledFor(triggerType, weekN, planAssignment) {
    if (!planAssignment) return null
    if (triggerType === 'on_week') {
      if (!planAssignment.start_date) return null
      const d = new Date(planAssignment.start_date)
      d.setDate(d.getDate() + weekN * 7)
      return d.toISOString()
    }
    if (triggerType === 'on_plan_end') {
      if (!planAssignment.end_date) return null
      return new Date(planAssignment.end_date).toISOString()
    }
    return null
  }

  // ── Enviar ───────────────────────────────────────────────
  async function handleSend() {
    if (!selectedIds.length) return
    setSending(true)

    const sent = []
    const skipped = []

    for (const studentId of selectedIds) {
      const student = students.find((s) => s.id === studentId)
      const label = student?.name || student?.email || studentId

      // Red de seguridad: aunque la UI ya lo bloquea, nunca insertar un envío
      // que a esa persona le llegaría sin una sola pregunta.
      if (isEmptyFor(student)) {
        skipped.push(`${label} (el formulario le llegaría vacío en su idioma)`)
        continue
      }

      // Resolver plan_assignment si el trigger lo requiere
      let planAssignment = null
      if (triggerNeedsPlan) {
        const plans = plansByStudent[studentId] || []
        if (plans.length === 0) {
          skipped.push(`${label} (sin plan activo)`)
          continue
        }
        if (plans.length === 1) {
          planAssignment = plans[0]
        } else {
          const chosenId = planChoice[studentId]
          planAssignment = plans.find((p) => p.id === chosenId)
          if (!planAssignment) {
            skipped.push(`${label} (sin plan elegido)`)
            continue
          }
        }
      }

      const scheduled_for = computeScheduledFor(triggerType, weekN, planAssignment)
      if (triggerNeedsPlan && !scheduled_for) {
        skipped.push(`${label} (plan sin fechas)`)
        continue
      }

      const status = triggerType === 'manual' ? 'pending' : 'scheduled'

      const payload = {
        coach_id: coachId,
        student_id: studentId,
        template_id: templateId || null,
        form_snapshot: formConfig,
        form_kind: formKind,
        trigger_type: triggerType,
        trigger_config: triggerType === 'on_week' ? { week: weekN } : {},
        scheduled_for,
        plan_assignment_id: planAssignment?.id || null,
        status,
      }

      const { error } = await supabase.from('intake_form_assignments').insert(payload)

      if (error) {
        // Para intake: el unique index puede fallar (ya hay activo)
        skipped.push(label)
      } else {
        sent.push(label)
      }
    }

    setSending(false)
    setResults({ sent, skipped })
    if (sent.length > 0) onSent?.()
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base">
              {isFollowUp ? 'Enviar formulario' : 'Enviar formulario'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {isFollowUp && templateName
                ? templateName
                : 'Seleccioná los alumnos que recibirán este formulario'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* RESULTADOS */}
        {results ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {results.sent.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-green-800">
                    {triggerType === 'manual' ? 'Enviado' : 'Programado'} para {results.sent.length}{' '}
                    alumno{results.sent.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="text-xs text-green-700 space-y-0.5 pl-5 list-disc">
                  {results.sent.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
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
                <ul className="text-xs text-amber-700 space-y-0.5 pl-5 list-disc">
                  {results.skipped.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
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
            {/* PASO 1 (follow_up): elegir trigger */}
            {step === 'trigger' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-xs text-gray-500 mb-2">¿Cuándo se manda?</p>
                {TRIGGER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTriggerType(opt.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      triggerType === opt.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar
                        size={14}
                        className={triggerType === opt.id ? 'text-blue-600' : 'text-gray-400'}
                      />
                      <span className="font-medium text-sm text-gray-900">{opt.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-6">{opt.hint}</p>
                  </button>
                ))}

                {triggerType === 'on_week' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-2">
                    <label className="block text-xs font-medium text-blue-800 mb-1.5">
                      Semana del plan
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={weekN}
                      onChange={(e) => setWeekN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 px-2 py-1.5 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs text-blue-700">desde el inicio del plan</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => setStep('students')}
                    className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    Siguiente <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: elegir alumnos */}
            {step === 'students' && (
              <>
                {/* Buscador + select all */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Buscar alumno..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                  <button
                    onClick={selectAllVisible}
                    className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Todos
                  </button>
                </div>

                {triggerNeedsPlan && (
                  <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
                    Solo alumnos con plan activo. Si tienen más de uno, te pediré elegir.
                  </div>
                )}

                {emptyLangs.length > 0 && (
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
                    ⚠ Este formulario no tiene ninguna pregunta para alumnos en{' '}
                    <strong>{emptyLangs.map((l) => LANG_LABEL[l] || l).join(' ni ')}</strong>. Están
                    deshabilitados abajo. Revisá en el editor la opción “Esta pregunta se muestra
                    a...”.
                  </div>
                )}

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
                    filteredStudents.map((student) => {
                      const selected = selectedIds.includes(student.id)
                      const studentPlans = plansByStudent[student.id] || []
                      const noPlan = triggerNeedsPlan && studentPlans.length === 0
                      const emptyForm = isEmptyFor(student)
                      const blocked = noPlan || emptyForm
                      const needsChoice =
                        triggerNeedsPlan &&
                        studentPlans.length > 1 &&
                        selected &&
                        !planChoice[student.id]

                      return (
                        <div key={student.id}>
                          <button
                            onClick={() => !blocked && toggleStudent(student.id)}
                            disabled={blocked}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 transition-colors text-left ${
                              blocked
                                ? 'opacity-40 cursor-not-allowed'
                                : selected
                                  ? 'bg-blue-50 border border-blue-200'
                                  : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                              }`}
                            >
                              {selected && (
                                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                  <path
                                    d="M2 6l3 3 5-5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {student.name}
                              </p>
                              <p
                                className={`text-xs truncate ${emptyForm ? 'text-amber-600' : 'text-gray-400'}`}
                              >
                                {noPlan
                                  ? 'sin plan activo'
                                  : emptyForm
                                    ? `⚠ este formulario no tiene preguntas en su idioma (${student.language || 'es'})`
                                    : student.email}
                              </p>
                            </div>
                          </button>

                          {/* Selector de plan si tiene >1 */}
                          {needsChoice && (
                            <div className="ml-8 mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1">
                              <p className="text-xs text-amber-800 font-medium">
                                Elegí el plan para este trigger:
                              </p>
                              {studentPlans.map((pa) => (
                                <button
                                  key={pa.id}
                                  onClick={() =>
                                    setPlanChoice((prev) => ({ ...prev, [student.id]: pa.id }))
                                  }
                                  className={`w-full text-left px-2 py-1.5 text-xs rounded border transition-colors ${
                                    planChoice[student.id] === pa.id
                                      ? 'bg-amber-200 border-amber-400 text-amber-900'
                                      : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {pa.plans?.title || 'Plan'}{' '}
                                  {pa.start_date && `(desde ${pa.start_date})`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 space-y-2">
                  {studentsNeedingPlanChoice.length > 0 && (
                    <p className="text-xs text-amber-700 text-center">
                      Falta elegir plan para {studentsNeedingPlanChoice.length} alumno
                      {studentsNeedingPlanChoice.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {isFollowUp && (
                      <button
                        onClick={() => setStep('trigger')}
                        className="px-4 py-3 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        ←
                      </button>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={
                        sending || selectedIds.length === 0 || studentsNeedingPlanChoice.length > 0
                      }
                      className="flex-1 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                            ? triggerType === 'manual'
                              ? `Enviar a ${selectedIds.length}`
                              : `Programar para ${selectedIds.length}`
                            : 'Seleccioná un alumno'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
