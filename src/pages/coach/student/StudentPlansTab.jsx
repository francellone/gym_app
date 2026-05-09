import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  ClipboardList, Plus, ChevronRight, MoreVertical, AlertTriangle,
  Loader,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ASSIGNMENT_STATUS, statusConfig, getAssignmentStatus,
  actionsForStatus, pickPrimaryTrainingAssignment,
  getScheduleMode, getPreferredDays, formatPreferredDays,
} from '../../../utils/assignmentHelpers'
import ReplacePlanModal from '../../../components/plan/ReplacePlanModal'
import DuplicatePlanModal from '../../../components/plan/DuplicatePlanModal'
import {
  ScheduleEditorInline,
  ScheduleEditorModal,
} from '../../../components/plan/ScheduleEditor'

// ─────────────────────────────────────────────────────────────
// StudentPlansTab
// Props:
//   assignments - lista completa de plan_assignments del alumno
//                 (incluye evaluaciones — las filtramos acá)
//   allPlans    - todos los planes disponibles (con plan_type para filtrar)
//   studentId   - UUID del alumno
//   onRefresh   - callback para recargar datos en el padre
//
// Esta pestaña SOLO muestra y gestiona planes de TRAINING.
// Las evaluaciones viven en la pestaña Evaluaciones aparte.
// ─────────────────────────────────────────────────────────────
export default function StudentPlansTab({ assignments, allPlans, studentId, onRefresh }) {
  const navigate = useNavigate()

  // Solo asignaciones de training. Las evaluaciones no aparecen acá.
  const trainingAssignments = useMemo(
    () => (assignments || []).filter(a => {
      const t = a.plan_type || a.plan?.plan_type || 'training'
      return t === 'training'
    }),
    [assignments]
  )

  // Solo planes de training disponibles para asignar.
  const trainingPlans = useMemo(
    () => (allPlans || []).filter(p => !p.plan_type || p.plan_type === 'training'),
    [allPlans]
  )

  // Estado del flujo de asignación
  const [assigningPlan, setAssigningPlan] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  // Horario para la asignación NUEVA (default flexible, ver Fase 1).
  const [newSchedule, setNewSchedule] = useState({
    schedule_mode: 'flexible',
    preferred_days: [],
  })
  const [replaceModal, setReplaceModal] = useState(null) // { incomingPlanId }
  const [duplicatingPlan, setDuplicatingPlan] = useState(null)

  // Modal de edición de horario para asignación existente.
  const [editingSchedule, setEditingSchedule] = useState(null) // assignment

  // Estado por fila (saving por id de asignación)
  const [savingAssignment, setSavingAssignment] = useState(null)
  const [openMenu, setOpenMenu] = useState(null) // assignment id
  const [reactivateModal, setReactivateModal] = useState(null) // { assignmentId, conflictAssignment }

  // Modal "este plan tiene evaluaciones asociadas, ¿las asignamos también?"
  const [linkedEvalsPrompt, setLinkedEvalsPrompt] = useState(null) // { trainingAssignmentId, evals: [{id,title,eval_type}], selected: Set }
  const [linkedEvalsLoading, setLinkedEvalsLoading] = useState(false)

  const incomingPlan = useMemo(
    () => trainingPlans.find(p => p.id === replaceModal?.incomingPlanId) || null,
    [trainingPlans, replaceModal]
  )
  const currentPrimary = useMemo(
    () => pickPrimaryTrainingAssignment(trainingAssignments),
    [trainingAssignments]
  )
  const currentActive = trainingAssignments.find(a => getAssignmentStatus(a) === 'active') || null

  // ============================================================
  // Asignar plan: detecta si hay activo y dispara modal de reemplazo
  // ============================================================
  function tryAssignPlan() {
    if (!selectedPlan) return

    if (currentActive) {
      setReplaceModal({ incomingPlanId: selectedPlan })
      return
    }

    // No hay activo: insertar directo.
    insertNewAssignment(selectedPlan)
  }

  // Construye el payload de horario a partir del estado newSchedule,
  // alineado con la invariante del backend (validador rechaza days en
  // flexible). Centralizado para usar también en handleReplaceConfirm.
  function schedulePayload(schedule) {
    const isFixed = schedule?.schedule_mode === 'fixed'
    return {
      schedule_mode: isFixed ? 'fixed' : 'flexible',
      preferred_days: isFixed
        ? (schedule.preferred_days || [])
        : null,
    }
  }

  function resetAssignForm() {
    setAssigningPlan(false)
    setSelectedPlan('')
    setNewSchedule({ schedule_mode: 'flexible', preferred_days: [] })
  }

  async function insertNewAssignment(planId, { closeReplaceModal = false } = {}) {
    try {
      const { data: inserted, error } = await supabase
        .from('plan_assignments')
        .insert({
          plan_id: planId,
          student_id: studentId,
          start_date: format(new Date(), 'yyyy-MM-dd'),
          ...schedulePayload(newSchedule),
          // status default 'active' lo pone la DB; trigger se encarga del active boolean.
        })
        .select()
        .single()
      if (error) throw error

      resetAssignForm()
      if (closeReplaceModal) setReplaceModal(null)

      // Después de asignar, ver si hay evaluaciones asociadas template-level.
      await maybePromptLinkedEvals(planId, inserted.id)

      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] insertNewAssignment', err)
      alert(err.message || 'Error al asignar el plan')
    }
  }

  // Busca evaluaciones template con parent_plan_id = plan asignado y, si
  // existen, abre el modal de prompt. El padre se entera del refresh por
  // separado: no bloqueamos el flujo de la asignación principal.
  async function maybePromptLinkedEvals(trainingPlanId, trainingAssignmentId) {
    try {
      const { data } = await supabase
        .from('plans')
        .select('id, title, eval_type')
        .eq('parent_plan_id', trainingPlanId)
        .eq('plan_type', 'evaluation')
      if (!data || data.length === 0) return

      // Evitar sugerir las que ya están asignadas y vivas para este alumno
      // y este plan en particular.
      const existing = new Set(
        (assignments || [])
          .filter(a => a.linked_assignment_id === trainingAssignmentId &&
            (a.plan_type || a.plan?.plan_type) === 'evaluation')
          .map(a => a.plan_id)
      )
      const toOffer = data.filter(ev => !existing.has(ev.id))
      if (toOffer.length === 0) return

      setLinkedEvalsPrompt({
        trainingAssignmentId,
        evals: toOffer,
        selected: new Set(toOffer.map(e => e.id)),
      })
    } catch (err) {
      console.error('[StudentPlansTab] maybePromptLinkedEvals', err)
    }
  }

  async function confirmLinkedEvals() {
    if (!linkedEvalsPrompt) return
    setLinkedEvalsLoading(true)
    try {
      const rows = [...linkedEvalsPrompt.selected].map(planId => ({
        plan_id: planId,
        student_id: studentId,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        linked_assignment_id: linkedEvalsPrompt.trainingAssignmentId,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from('plan_assignments').insert(rows)
        if (error) throw error
      }
      setLinkedEvalsPrompt(null)
      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] confirmLinkedEvals', err)
      alert(err.message || 'Error al asignar las evaluaciones')
    } finally {
      setLinkedEvalsLoading(false)
    }
  }

  // Confirmación del modal de reemplazo
  //
  // Orden importante para no chocar con el índice parcial único
  // `one_active_training_per_student WHERE status='active' AND plan_type='training'`:
  //
  //   1) Cerrar la saliente PRIMERO (status → 'replaced' o 'paused').
  //      Acá deja de ser 'active' y libera el slot en el índice.
  //   2) INSERT de la nueva (status default 'active'). Ya no choca.
  //   3) Si fue reemplazo, completar replaced_by_assignment_id apuntando
  //      a la nueva (esto solo se puede hacer una vez creada).
  //
  // Si algún paso falla, hacemos best-effort de revertir.
  async function handleReplaceConfirm({ outgoingTransition, reason }) {
    if (!currentActive || !replaceModal?.incomingPlanId) return

    const outgoingId = currentActive.id
    let outgoingClosed = false
    let inserted = null

    try {
      // 1) Cerrar la saliente.
      const closePayload = {
        status: outgoingTransition,
        status_reason: reason,
      }
      if (outgoingTransition === 'replaced') {
        closePayload.end_date = format(new Date(), 'yyyy-MM-dd')
        // replaced_by_assignment_id se completa en el paso 3.
      }
      const { error: closeErr } = await supabase
        .from('plan_assignments')
        .update(closePayload)
        .eq('id', outgoingId)
      if (closeErr) throw closeErr
      outgoingClosed = true

      // 2) Insertar la nueva.
      const insertRes = await supabase
        .from('plan_assignments')
        .insert({
          plan_id: replaceModal.incomingPlanId,
          student_id: studentId,
          start_date: format(new Date(), 'yyyy-MM-dd'),
          ...schedulePayload(newSchedule),
        })
        .select()
        .single()
      if (insertRes.error) throw insertRes.error
      inserted = insertRes.data

      // 3) Si fue reemplazo, completar el puntero al sucesor.
      if (outgoingTransition === 'replaced') {
        const { error: linkErr } = await supabase
          .from('plan_assignments')
          .update({ replaced_by_assignment_id: inserted.id })
          .eq('id', outgoingId)
        if (linkErr) throw linkErr
      }

      setReplaceModal(null)
      resetAssignForm()

      // Si el plan entrante tiene evaluaciones template asociadas, ofrecerlas.
      await maybePromptLinkedEvals(replaceModal.incomingPlanId, inserted.id)

      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] handleReplaceConfirm', err)
      // Best-effort rollback: si cerramos la saliente pero falló el insert,
      // la reactivamos para no dejar al alumno sin plan.
      if (outgoingClosed && !inserted) {
        try {
          await supabase
            .from('plan_assignments')
            .update({
              status: 'active',
              status_reason: null,
              end_date: null,
              replaced_by_assignment_id: null,
            })
            .eq('id', outgoingId)
        } catch (rollbackErr) {
          console.error('[StudentPlansTab] rollback failed', rollbackErr)
        }
      }
      alert(err.message || 'Error al reemplazar el plan')
      onRefresh()
    }
  }

  // ============================================================
  // Acciones por fila (kebab)
  // ============================================================
  async function changeStatus(assignment, toStatus, { reason } = {}) {
    setSavingAssignment(assignment.id)
    try {
      const payload = {
        status: toStatus,
        status_reason: reason ?? null,
      }
      if (toStatus === 'completed') {
        payload.end_date = format(new Date(), 'yyyy-MM-dd')
      }
      // Reactivar limpia replaced_by, end_date y reason.
      if (toStatus === 'active') {
        payload.replaced_by_assignment_id = null
        payload.end_date = null
        payload.status_reason = null
      }
      const { error } = await supabase
        .from('plan_assignments')
        .update(payload)
        .eq('id', assignment.id)
      if (error) throw error
      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] changeStatus', err)
      alert(err.message || 'Error al cambiar el estado')
    } finally {
      setSavingAssignment(null)
      setOpenMenu(null)
    }
  }

  function tryReactivate(assignment) {
    // Si hay otro training activo, pedir confirmación: vamos a pausar el actual.
    if (currentActive && currentActive.id !== assignment.id) {
      setReactivateModal({ assignmentId: assignment.id, conflictAssignment: currentActive })
      setOpenMenu(null)
      return
    }
    changeStatus(assignment, 'active')
  }

  async function confirmReactivate() {
    if (!reactivateModal) return
    setSavingAssignment(reactivateModal.assignmentId)
    try {
      // 1. Pausar el actualmente activo.
      const { error: pauseErr } = await supabase
        .from('plan_assignments')
        .update({
          status: 'paused',
          status_reason: 'Pausado al reactivar otro plan',
        })
        .eq('id', reactivateModal.conflictAssignment.id)
      if (pauseErr) throw pauseErr

      // 2. Reactivar el deseado.
      const target = trainingAssignments.find(a => a.id === reactivateModal.assignmentId)
      if (target) {
        const { error: actErr } = await supabase
          .from('plan_assignments')
          .update({
            status: 'active',
            status_reason: null,
            replaced_by_assignment_id: null,
            end_date: null,
          })
          .eq('id', target.id)
        if (actErr) throw actErr
      }

      setReactivateModal(null)
      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] confirmReactivate', err)
      alert(err.message || 'Error al reactivar el plan')
    } finally {
      setSavingAssignment(null)
    }
  }

  async function handleDelete(assignment) {
    const confirmed = window.confirm(
      `¿Eliminar definitivamente la asignación de "${assignment.plan?.title}"? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return
    setSavingAssignment(assignment.id)
    try {
      const { error } = await supabase
        .from('plan_assignments')
        .delete()
        .eq('id', assignment.id)
      if (error) throw error
      onRefresh()
    } catch (err) {
      console.error('[StudentPlansTab] handleDelete', err)
      alert(err.message || 'Error al eliminar la asignación')
    } finally {
      setSavingAssignment(null)
      setOpenMenu(null)
    }
  }

  // ============================================================
  // Duplicar como base (atajo desde modal de reemplazo)
  // ============================================================
  function handleDuplicateOutgoing() {
    if (!currentActive?.plan) return
    setDuplicatingPlan({
      ...currentActive.plan,
      // El modal espera el plan completo: si solo trajimos title/plan_type,
      // pasamos lo que tenemos.
    })
    // Mantenemos replaceModal abierto para que la coach vuelva a él tras editar.
    // Pero el DuplicatePlanModal navega a EditPlanPage al terminar, así que
    // de hecho perdemos el modal — ese es el comportamiento esperado:
    // termina de editar y vuelve manualmente acá.
    setReplaceModal(null)
  }

  function handleDuplicateDone(newPlan) {
    setDuplicatingPlan(null)
    // Llevar al editor del plan recién duplicado.
    navigate(`/coach/plans/${newPlan.id}/edit`)
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Planes de entrenamiento</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {currentPrimary
              ? `Vigente: ${currentPrimary.plan?.title || '—'}`
              : 'Sin plan vigente'}
          </p>
        </div>
        <button
          onClick={() => setAssigningPlan(true)}
          className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
        >
          <Plus size={14} /> Asignar plan
        </button>
      </div>

      {/* Form de asignación inline */}
      {assigningPlan && (() => {
        const planRow = trainingPlans.find(p => p.id === selectedPlan)
        const sessionsPerWeek = planRow?.sessions_per_week ?? null
        const isFixed = newSchedule.schedule_mode === 'fixed'
        const fixedHasNoDays = isFixed && (newSchedule.preferred_days?.length || 0) === 0
        return (
          <div className="card border-2 border-primary-200 space-y-3">
            <h4 className="font-medium text-gray-900">Asignar nuevo plan</h4>
            <select
              value={selectedPlan}
              onChange={e => setSelectedPlan(e.target.value)}
              className="input"
            >
              <option value="">Seleccioná un plan...</option>
              {trainingPlans.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>

            {/* Editor de horario (Fase 2). Visible siempre que haya
                plan elegido para que el coach decida desde el inicio. */}
            {selectedPlan && (
              <div className="pt-1">
                <p className="label">Horario</p>
                <ScheduleEditorInline
                  value={newSchedule}
                  onChange={setNewSchedule}
                  sessionsPerWeek={sessionsPerWeek || undefined}
                />
              </div>
            )}

            {currentActive && selectedPlan && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                Este alumno ya tiene un plan activo. Te vamos a preguntar qué hacer con él al confirmar.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={resetAssignForm}
                className="btn-secondary flex-1 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={tryAssignPlan}
                disabled={!selectedPlan || fixedHasNoDays}
                className="btn-primary flex-1 text-sm"
              >
                {currentActive ? 'Continuar…' : 'Asignar'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Lista vacía */}
      {trainingAssignments.length === 0 && !assigningPlan && (
        <div className="card text-center py-8 text-gray-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin planes de entrenamiento asignados</p>
        </div>
      )}

      {/* Lista de asignaciones de training */}
      {trainingAssignments.length > 0 && (
        <div className="space-y-2">
          {/* Activos / pausados arriba, cerrados abajo */}
          {trainingAssignments
            .slice()
            .sort((a, b) => {
              const sa = getAssignmentStatus(a)
              const sb = getAssignmentStatus(b)
              const liveA = sa === 'active' || sa === 'paused'
              const liveB = sb === 'active' || sb === 'paused'
              if (liveA !== liveB) return liveA ? -1 : 1
              const ta = new Date(a.created_at || 0).getTime()
              const tb = new Date(b.created_at || 0).getTime()
              return tb - ta
            })
            .map(a => {
              // Cuántas evaluaciones tiene vinculadas a esta asignación.
              const linkedEvalCount = (assignments || []).filter(x =>
                x.linked_assignment_id === a.id &&
                (x.plan_type || x.plan?.plan_type) === 'evaluation'
              ).length
              return (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  trainingAssignments={trainingAssignments}
                  linkedEvalCount={linkedEvalCount}
                  saving={savingAssignment === a.id}
                  menuOpen={openMenu === a.id}
                  onToggleMenu={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                  onCloseMenu={() => setOpenMenu(null)}
                  onTransition={(toStatus) => changeStatus(a, toStatus)}
                  onReactivate={() => tryReactivate(a)}
                  onDelete={() => handleDelete(a)}
                  onEditSchedule={() => { setEditingSchedule(a); setOpenMenu(null) }}
                />
              )
            })}
        </div>
      )}

      {/* Modal: ya hay activo, qué hacemos con el saliente */}
      {replaceModal && currentActive && incomingPlan && (
        <ReplacePlanModal
          currentAssignment={currentActive}
          incomingPlan={incomingPlan}
          onCancel={() => setReplaceModal(null)}
          onConfirm={handleReplaceConfirm}
          onDuplicateOutgoing={handleDuplicateOutgoing}
        />
      )}

      {/* Modal: reactivar pisaría a otro activo */}
      {reactivateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setReactivateModal(null) }}
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Reactivar plan</p>
                <p className="text-sm text-gray-500 mt-1">
                  Esto va a pausar el plan actual <span className="font-medium text-gray-700">"{reactivateModal.conflictAssignment.plan?.title}"</span>. ¿Continuar?
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setReactivateModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmReactivate}
                disabled={savingAssignment === reactivateModal.assignmentId}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 flex items-center justify-center gap-1.5"
              >
                {savingAssignment === reactivateModal.assignmentId
                  ? <Loader size={14} className="animate-spin" />
                  : 'Sí, reactivar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de duplicar (compartido) */}
      {duplicatingPlan && (
        <DuplicatePlanModal
          plan={duplicatingPlan}
          onClose={() => setDuplicatingPlan(null)}
          onDone={handleDuplicateDone}
        />
      )}

      {/* Modal: editar horario de una asignación existente */}
      {editingSchedule && (
        <ScheduleEditorModal
          assignment={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => onRefresh()}
        />
      )}

      {/* Modal: el plan tiene evaluaciones asociadas */}
      {linkedEvalsPrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !linkedEvalsLoading) setLinkedEvalsPrompt(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900">Evaluaciones asociadas al plan</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Este plan tiene {linkedEvalsPrompt.evals.length} evaluación{linkedEvalsPrompt.evals.length > 1 ? 'es' : ''} asociada{linkedEvalsPrompt.evals.length > 1 ? 's' : ''}. ¿Asignárselas también al alumno?
              </p>
            </div>
            <div className="space-y-2">
              {linkedEvalsPrompt.evals.map(ev => {
                const checked = linkedEvalsPrompt.selected.has(ev.id)
                return (
                  <label
                    key={ev.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      checked ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(linkedEvalsPrompt.selected)
                        if (e.target.checked) next.add(ev.id); else next.delete(ev.id)
                        setLinkedEvalsPrompt({ ...linkedEvalsPrompt, selected: next })
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${checked ? 'text-purple-700' : 'text-gray-700'}`}>
                        📊 {ev.title}
                      </p>
                      {ev.eval_type && (
                        <p className="text-xs text-gray-500">{ev.eval_type}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setLinkedEvalsPrompt(null)}
                disabled={linkedEvalsLoading}
                className="btn-secondary flex-1 text-sm"
              >
                No, gracias
              </button>
              <button
                onClick={confirmLinkedEvals}
                disabled={linkedEvalsLoading || linkedEvalsPrompt.selected.size === 0}
                className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
              >
                {linkedEvalsLoading
                  ? <Loader size={14} className="animate-spin" />
                  : `Asignar ${linkedEvalsPrompt.selected.size > 0 ? `(${linkedEvalsPrompt.selected.size})` : ''}`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AssignmentRow
// ─────────────────────────────────────────────────────────────
function AssignmentRow({
  assignment, trainingAssignments, linkedEvalCount = 0,
  saving, menuOpen, onToggleMenu, onCloseMenu,
  onTransition, onReactivate, onDelete, onEditSchedule,
}) {
  const status = getAssignmentStatus(assignment)
  const cfg = statusConfig(status)
  const actions = actionsForStatus(status)
  const startDate = assignment.start_date
    ? format(parseISO(assignment.start_date), 'dd/MM/yy', { locale: es })
    : null
  const endDate = assignment.end_date
    ? format(parseISO(assignment.end_date), 'dd/MM/yy', { locale: es })
    : null

  const replacedBy = status === 'replaced' && assignment.replaced_by_assignment_id
    ? trainingAssignments.find(x => x.id === assignment.replaced_by_assignment_id)
    : null

  const isLive = status === 'active' || status === 'paused'
  const planRoute = `/coach/plans/${assignment.plan_id}`

  // Horario (Fase 2)
  const scheduleMode = getScheduleMode(assignment)
  const preferredDays = getPreferredDays(assignment)
  const scheduleLabel = scheduleMode === 'fixed' && preferredDays.length > 0
    ? formatPreferredDays(preferredDays)
    : 'Horario flexible'

  return (
    <div className={`card flex items-start gap-3 ${!isLive ? 'opacity-80' : ''}`}>
      {/* Dot de estado */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${cfg.dotClass}`} />

      {/* Info del plan */}
      <Link
        to={planRoute}
        className="flex-1 min-w-0 group flex items-start gap-1 hover:opacity-70 transition-opacity"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-gray-900 truncate">
              {assignment.plan?.title || '—'}
            </p>
            <span className={`badge text-[10px] ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {startDate ? `Desde ${startDate}` : 'Sin fecha de inicio'}
            {endDate ? ` · Hasta ${endDate}` : ''}
            {linkedEvalCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-purple-600">
                · 📊 {linkedEvalCount} {linkedEvalCount === 1 ? 'evaluación' : 'evaluaciones'}
              </span>
            )}
          </p>
          {/* Badge de horario (Fase 2) — solo en filas vivas para no
              ensuciar las filas archivadas/reemplazadas. */}
          {isLive && (
            <span
              className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                scheduleMode === 'fixed'
                  ? 'bg-primary-50 text-primary-700 border border-primary-100'
                  : 'bg-gray-50 text-gray-500 border border-gray-200'
              }`}
            >
              📅 {scheduleLabel}
            </span>
          )}
          {assignment.status_reason && (
            <p className="text-xs text-gray-400 italic mt-0.5 truncate">
              "{assignment.status_reason}"
            </p>
          )}
          {replacedBy && (
            <p className="text-xs text-blue-600 mt-0.5 truncate">
              ↳ Reemplazado por {replacedBy.plan?.title}
            </p>
          )}
        </div>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>

      {/* Menú kebab */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.preventDefault(); onToggleMenu() }}
          disabled={saving}
          className="btn-ghost p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          {saving
            ? <Loader size={16} className="animate-spin" />
            : <MoreVertical size={16} />
          }
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={onCloseMenu}
            />
            <div className="absolute right-0 top-9 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
              {/* Editar horario solo en asignaciones vivas */}
              {isLive && onEditSchedule && (
                <>
                  <button
                    onClick={onEditSchedule}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Editar horario
                  </button>
                  {actions.length > 0 && (
                    <div className="my-1 border-t border-gray-100" />
                  )}
                </>
              )}
              {actions.map(action => {
                const isReactivate = action.toStatus === 'active'
                return (
                  <button
                    key={action.key}
                    onClick={() => {
                      if (isReactivate) onReactivate()
                      else onTransition(action.toStatus)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {action.label}
                  </button>
                )
              })}
              {actions.length > 0 && (
                <div className="my-1 border-t border-gray-100" />
              )}
              <button
                onClick={onDelete}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Re-export por si algún consumidor lo usa.
export { ASSIGNMENT_STATUS }
