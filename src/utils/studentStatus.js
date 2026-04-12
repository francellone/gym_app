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
 * Calcula el estado del plan de un alumno a partir de sus asignaciones.
 * @returns {'active' | 'no_plan'}
 */
export function getPlanStatus(planAssignments) {
  if (!planAssignments || planAssignments.length === 0) return 'no_plan'
  return planAssignments.some(a => a.active) ? 'active' : 'no_plan'
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
