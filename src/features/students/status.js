import { differenceInDays, parseISO, isValid } from 'date-fns'

/**
 * Calcula el estado de pago de un alumno a partir de sus campos de perfil.
 * @returns {'overdue' | 'due_soon' | 'up_to_date' | 'no_data'}
 */
export function getPaymentStatus(student) {
  if (!student?.next_payment_due) return 'no_data'
  try {
    const dueDate = parseISO(student.next_payment_due)
    if (!isValid(dueDate)) return 'no_data'
    const daysUntilDue = differenceInDays(dueDate, new Date())
    if (daysUntilDue < 0) return 'overdue'
    if (daysUntilDue <= 7) return 'due_soon'
    return 'up_to_date'
  } catch {
    return 'no_data'
  }
}

/**
 * Calcula el estado del plan de entrenamiento de un alumno.
 * Considera solo asignaciones con plan_type='training' (las evaluaciones
 * NO cuentan como "tener plan"). Una asignación cuenta como vigente si
 * status='active' o si todavía no tiene status (compat con datos viejos
 * donde solo existía el booleano active).
 * @returns {'active' | 'no_plan'}
 */
export function getPlanStatus(planAssignments) {
  if (!planAssignments || planAssignments.length === 0) return 'no_plan'
  const hasActiveTraining = planAssignments.some((a) => {
    const planType = a.plan_type || a.plan?.plan_type || 'training'
    if (planType !== 'training') return false
    if (a.status) return a.status === 'active'
    return !!a.active
  })
  return hasActiveTraining ? 'active' : 'no_plan'
}

export const PAYMENT_STATUS = {
  overdue: {
    label: 'Pago vencido',
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    icon: '🔴',
  },
  due_soon: {
    label: 'Vence pronto',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    dotClass: 'bg-yellow-500',
    icon: '🟡',
  },
  up_to_date: {
    label: 'Al día',
    badgeClass: 'bg-green-100 text-green-700',
    dotClass: 'bg-green-500',
    icon: '🟢',
  },
  no_data: {
    label: 'Sin registro',
    badgeClass: 'bg-gray-100 text-gray-500',
    dotClass: 'bg-gray-300',
    icon: '⚪',
  },
}

export const PLAN_STATUS = {
  active: {
    label: 'Con plan',
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
  },
  no_plan: {
    label: 'Sin plan',
    badgeClass: 'bg-gray-100 text-gray-500',
    dotClass: 'bg-gray-300',
  },
}

// Mismo umbral que ALERT_THRESHOLDS.PLAN_EXPIRING_SOON_DAYS del dashboard.
export const PLAN_EXPIRING_SOON_DAYS = 7

/**
 * Devuelve la asignación de TRAINING vigente (o null).
 * Misma convención que getPlanStatus.
 */
function pickActiveTraining(planAssignments) {
  return (
    (planAssignments || []).find((a) => {
      const planType = a.plan_type || a.plan?.plan_type || 'training'
      if (planType !== 'training') return false
      if (a.status) return a.status === 'active'
      return !!a.active
    }) || null
  )
}

/**
 * Estado de VIGENCIA del plan: cuánto le queda al plan que la persona
 * está entrenando. Se apoya en `expected_end_date` (v48), que es el
 * vencimiento derivado de `plans.duration_weeks`.
 *
 * OJO: no confundir con `closed_at`, que es la fecha en que la
 * asignación se cerró de verdad y siempre está en el pasado.
 *
 * @returns {'expiring_soon' | 'expired' | 'on_track' | 'open' | 'no_plan'}
 */
export function getPlanExpiryStatus(planAssignments, today = new Date()) {
  const assignment = pickActiveTraining(planAssignments)
  if (!assignment) return 'no_plan'
  if (!assignment.expected_end_date) return 'open'
  try {
    const end = parseISO(assignment.expected_end_date)
    if (!isValid(end)) return 'open'
    const daysLeft = differenceInDays(end, today)
    if (daysLeft < 0) return 'expired'
    if (daysLeft <= PLAN_EXPIRING_SOON_DAYS) return 'expiring_soon'
    return 'on_track'
  } catch {
    return 'open'
  }
}

/** Datos crudos de la vigencia, para pintar la fecha y el "estimada". */
export function getPlanExpiryInfo(planAssignments, today = new Date()) {
  const assignment = pickActiveTraining(planAssignments)
  const status = getPlanExpiryStatus(planAssignments, today)
  const endYmd = assignment?.expected_end_date || null
  let daysLeft = null
  if (endYmd) {
    const end = parseISO(endYmd)
    if (isValid(end)) daysLeft = differenceInDays(end, today)
  }
  return {
    status,
    assignment,
    expectedEndDate: endYmd,
    daysLeft,
    // 'backfill' = la puso la migración a partir de la duración del plan;
    // la coach todavía no la confirmó.
    isEstimated: assignment?.expected_end_source === 'backfill',
    isManual: assignment?.expected_end_source === 'manual',
  }
}


/**
 * Semáforo de vigencia del plan. Comparte la escala de colores con
 * PAYMENT_STATUS a propósito, pero NO el ícono: dos badges idénticos
 * uno al lado del otro se leen como uno solo.
 */
export const PLAN_EXPIRY_STATUS = {
  expired: {
    label: 'Plan vencido',
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
    icon: '📅',
  },
  expiring_soon: {
    label: 'Vence pronto',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    dotClass: 'bg-yellow-500',
    icon: '📅',
  },
  on_track: {
    label: 'Con plan',
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
    icon: '📅',
  },
  open: {
    label: 'Con plan (sin vencimiento)',
    badgeClass: 'bg-blue-50 text-blue-600',
    dotClass: 'bg-blue-300',
    icon: '📅',
  },
  no_plan: {
    label: 'Sin plan',
    badgeClass: 'bg-gray-100 text-gray-500',
    dotClass: 'bg-gray-300',
    icon: '📅',
  },
}
