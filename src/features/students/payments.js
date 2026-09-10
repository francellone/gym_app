// ============================================================
// payments.js — historial de cobros (v49)
// ------------------------------------------------------------
// El pago vive en la tabla `payments`, con RLS de coach: el alumno no
// ve ni una fila. `profiles.next_payment_due` y `last_payment_date`
// son CACHÉ derivado que mantiene un trigger, así que acá nunca se
// escriben a mano.
//
// El vencimiento del PAGO no tiene nada que ver con el vencimiento del
// PLAN (`plan_assignments.expected_end_date`). Ver
// docs/decisiones-vencimiento-plan-vs-pago.md.
// ============================================================
import { addDays, differenceInDays, format, parseISO, isValid } from 'date-fns'

export const DEFAULT_CYCLE_DAYS = 30

const ymd = (d) => format(d, 'yyyy-MM-dd')

function parseYmd(value) {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

/**
 * Largo (en días, inclusive) del período que cubre un pago.
 */
export function periodLength(payment) {
  const start = parseYmd(payment?.period_start)
  const end = parseYmd(payment?.period_end)
  if (!start || !end) return null
  return differenceInDays(end, start) + 1
}

/**
 * Propone el próximo período a cobrar: arranca el día siguiente al
 * último día cubierto y dura lo que diga el ciclo del alumno; si no
 * tiene ciclo declarado, lo mismo que duró el último período; si no
 * hay historial, 30 días desde hoy.
 *
 * @param {Array} payments  historial (puede venir vacío o desordenado)
 * @param {number|null} cycleDays  profiles.payment_cycle_days
 * @param {Date} today
 * @returns {{ period_start: string, period_end: string, paid_on: string }}
 */
export function proposeNextPeriod(payments, cycleDays, today = new Date()) {
  const rows = (payments || []).filter((p) => parseYmd(p?.period_end))
  const last = rows.reduce((acc, p) => {
    if (!acc) return p
    return parseYmd(p.period_end) > parseYmd(acc.period_end) ? p : acc
  }, null)

  const length = cycleDays && cycleDays > 0 ? cycleDays : periodLength(last) || DEFAULT_CYCLE_DAYS

  // Si el último período todavía no terminó, el nuevo arranca al día
  // siguiente igual: se está pagando por adelantado, no se pisa nada.
  const start = last ? addDays(parseYmd(last.period_end), 1) : today

  return {
    paid_on: ymd(today),
    period_start: ymd(start),
    period_end: ymd(addDays(start, length - 1)),
  }
}

/**
 * Traduce los errores de la base a algo que la coach pueda leer.
 * 23P01 = payments_no_overlap (D8).
 */
export function friendlyPaymentError(error) {
  const code = error?.code
  if (code === '23P01') {
    return 'Ese período ya está cubierto por otro pago registrado. Revisá el historial.'
  }
  if (code === '23514') {
    return 'Revisá las fechas y el monto: el período no puede terminar antes de empezar.'
  }
  if (code === '42501' || code === 'PGRST301') {
    return 'No tenés permisos para registrar pagos de esta persona.'
  }
  return error?.message || 'Error al guardar el pago'
}

// ── Acceso a datos ──────────────────────────────────────────

export async function fetchPayments(supabase, studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('student_id', studentId)
    .order('period_end', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createPayment(supabase, payment) {
  const { data, error } = await supabase.from('payments').insert(payment).select().single()
  if (error) {
    const wrapped = new Error(friendlyPaymentError(error))
    wrapped.code = error.code
    wrapped.original = error
    throw wrapped
  }
  return data
}

export async function deletePayment(supabase, paymentId) {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  if (error) {
    const wrapped = new Error(friendlyPaymentError(error))
    wrapped.code = error.code
    wrapped.original = error
    throw wrapped
  }
}

/**
 * ¿Tiene sentido ofrecer extender la vigencia del plan hasta el fin del
 * período que se está pagando? (D4: se OFRECE, nunca se hace solo.)
 */
export function shouldOfferPlanExtension(assignment, periodEnd) {
  if (!assignment || !periodEnd) return false
  const end = parseYmd(periodEnd)
  const planEnd = parseYmd(assignment.expected_end_date)
  if (!end) return false
  if (!planEnd) return false // plan abierto: no hay nada que extender
  return planEnd < end
}

export function formatAmount(amount, currency = 'ARS') {
  if (amount === null || amount === undefined || amount === '') return null
  const n = Number(amount)
  if (Number.isNaN(n)) return null
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}
