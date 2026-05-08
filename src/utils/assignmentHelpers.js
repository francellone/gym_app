// ============================================================
// Helpers para el ciclo de vida de plan_assignments
//   status: active | paused | replaced | completed | archived
//
// Convenciones:
//   - 'active'   → el plan vigente del alumno (visible en TodayWorkout)
//   - 'paused'   → pausado por el coach (lesión, vacaciones, etc.).
//                  No es visible para el alumno pero se puede reactivar.
//   - 'replaced' → reemplazado por otro plan. replaced_by_assignment_id
//                  apunta al sucesor.
//   - 'completed'→ ciclo cerrado formalmente (cumplió duración, etc.).
//   - 'archived' → finalización manual neutra (alta/baja, error, otros).
// ============================================================

export const ASSIGNMENT_STATUSES = ['active', 'paused', 'replaced', 'completed', 'archived']

export const ASSIGNMENT_STATUS = {
  active: {
    key: 'active',
    label: 'Activo',
    shortLabel: 'Activo',
    description: 'Plan vigente, el alumno entrena con éste',
    icon: '🟢',
    badgeClass: 'bg-green-100 text-green-700',
    dotClass: 'bg-green-500',
    rowAccentClass: 'border-green-200',
  },
  paused: {
    key: 'paused',
    label: 'En pausa',
    shortLabel: 'Pausa',
    description: 'Pausado por el coach. Reactivable',
    icon: '⏸️',
    badgeClass: 'bg-amber-100 text-amber-700',
    dotClass: 'bg-amber-500',
    rowAccentClass: 'border-amber-200',
  },
  replaced: {
    key: 'replaced',
    label: 'Reemplazado',
    shortLabel: 'Reemplazado',
    description: 'Otro plan tomó su lugar',
    icon: '🔁',
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-400',
    rowAccentClass: 'border-blue-100',
  },
  completed: {
    key: 'completed',
    label: 'Completado',
    shortLabel: 'Completado',
    description: 'Ciclo cerrado formalmente',
    icon: '✅',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    dotClass: 'bg-emerald-500',
    rowAccentClass: 'border-emerald-100',
  },
  archived: {
    key: 'archived',
    label: 'Archivado',
    shortLabel: 'Archivado',
    description: 'Finalización manual',
    icon: '🗄️',
    badgeClass: 'bg-gray-100 text-gray-500',
    dotClass: 'bg-gray-400',
    rowAccentClass: 'border-gray-100',
  },
}

export function statusConfig(status) {
  return ASSIGNMENT_STATUS[status] || ASSIGNMENT_STATUS.archived
}

// Compatibilidad con datos viejos: si una asignación no trae status
// (cliente desactualizado o fila sin migrar), inferirlo del booleano.
export function getAssignmentStatus(assignment) {
  if (!assignment) return null
  if (assignment.status) return assignment.status
  return assignment.active ? 'active' : 'archived'
}

export function isActive(assignment) {
  return getAssignmentStatus(assignment) === 'active'
}

export function isLiveAssignment(assignment) {
  // "Vivo" = el alumno está usando este plan o lo va a retomar.
  const s = getAssignmentStatus(assignment)
  return s === 'active' || s === 'paused'
}

export function isClosedAssignment(assignment) {
  const s = getAssignmentStatus(assignment)
  return s === 'replaced' || s === 'completed' || s === 'archived'
}

// ============================================================
// Selección del plan vigente
// ============================================================
// Devuelve la asignación 'active' de tipo training más reciente.
// Si no hay activa pero sí pausadas, devuelve la pausada más reciente.
// Pensado para la lista de alumnos (StudentsPage), donde queremos
// mostrar SIEMPRE el plan más relevante, sin importar el orden con
// el que vino la query.
export function pickPrimaryTrainingAssignment(assignments) {
  if (!assignments || assignments.length === 0) return null

  const trainings = assignments.filter(
    a => (a.plan_type || a.plan?.plan_type || 'training') === 'training'
  )
  if (trainings.length === 0) return null

  const byCreated = (a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  }

  const active = trainings
    .filter(a => getAssignmentStatus(a) === 'active')
    .sort(byCreated)
  if (active.length > 0) return active[0]

  const paused = trainings
    .filter(a => getAssignmentStatus(a) === 'paused')
    .sort(byCreated)
  if (paused.length > 0) return paused[0]

  return null
}

// ============================================================
// Transiciones permitidas
// ============================================================
// Mapa de qué estados se pueden alcanzar desde uno dado.
// El cliente lo usa para decidir qué botones mostrar en la UI;
// la DB no fuerza estas reglas (no agregamos otro trigger por
// ahora — son lo bastante simples como para vivir solo en cliente).
export const ALLOWED_TRANSITIONS = {
  active:    ['paused', 'completed', 'archived', 'replaced'],
  paused:    ['active', 'completed', 'archived'],
  replaced:  ['active'], // reactivar (con confirmación si hay otro activo)
  completed: ['active'], // reabrir
  archived:  ['active'], // reactivar
}

export function canTransition(from, to) {
  if (!from || !to) return false
  if (from === to) return false
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

// Acciones disponibles en el menú según el estado actual.
// Cada entrada describe el botón que se muestra en el kebab de la
// fila de plan en StudentPlansTab.
export function actionsForStatus(status) {
  switch (status) {
    case 'active':
      return [
        { key: 'pause',     label: 'Pausar',         tone: 'neutral',  toStatus: 'paused' },
        { key: 'complete',  label: 'Marcar completado', tone: 'success', toStatus: 'completed' },
        { key: 'archive',   label: 'Archivar',       tone: 'neutral',  toStatus: 'archived' },
      ]
    case 'paused':
      return [
        { key: 'reactivate',label: 'Reactivar',      tone: 'primary',  toStatus: 'active' },
        { key: 'complete',  label: 'Marcar completado', tone: 'success', toStatus: 'completed' },
        { key: 'archive',   label: 'Archivar',       tone: 'neutral',  toStatus: 'archived' },
      ]
    case 'replaced':
    case 'completed':
    case 'archived':
      return [
        { key: 'reactivate',label: 'Reactivar',      tone: 'primary',  toStatus: 'active' },
      ]
    default:
      return []
  }
}

// ============================================================
// Helpers para asignación de evaluaciones
// ============================================================
// Las evaluaciones pueden vivir asociadas a un plan (linked_assignment_id)
// o ser independientes. Estas funciones agrupan la pestaña Evaluaciones
// del alumno en 3 secciones: del plan actual, independientes, históricas.

export function groupEvaluationAssignments(assignments) {
  const evals = (assignments || []).filter(
    a => (a.plan_type || a.plan?.plan_type) === 'evaluation'
  )

  const activeTraining = pickPrimaryTrainingAssignment(assignments || [])
  const activeTrainingId = activeTraining?.id || null

  const ofCurrentPlan = []
  const independent = []
  const historical = []

  for (const ev of evals) {
    if (!ev.linked_assignment_id) {
      independent.push(ev)
    } else if (ev.linked_assignment_id === activeTrainingId) {
      ofCurrentPlan.push(ev)
    } else {
      historical.push(ev)
    }
  }

  return { ofCurrentPlan, independent, historical, activeTraining }
}
