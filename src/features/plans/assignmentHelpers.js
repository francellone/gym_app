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

// ============================================================
// Asignación de plantilla → alumno (RPC `assign_template_to_student`)
// ------------------------------------------------------------
// Desde la migración `fix_2_1_y_raices_template_assignments` (2026-05-15),
// `plan_assignments` no puede apuntar a un plan con `is_template = true`:
// el trigger `trg_pa_forbid_template` lo rechaza con `check_violation`.
//
// Para asignar una plantilla a un alumno, el front DEBE llamar a la RPC
// `assign_template_to_student`, que clona la plantilla a una instancia
// personal y crea el plan_assignment de forma atómica.
//
// La RPC sirve tanto para training como evaluation (lee `plan_type` de
// la plantilla y propaga al clon).
//
// Errores conocidos:
//   - '23514' check_violation: el plan_id no es plantilla.
//   - '23503' foreign_key_violation: plan o alumno no existen / inválidos.
//
// Returns: { assignment_id, plan_id (nueva instancia), template_id, student_id }
// ============================================================
export async function assignTemplateToStudent(
  supabase,
  {
    templateId,
    studentId,
    startDate, // 'YYYY-MM-DD' o null para hoy
    endDate = null, // 'YYYY-MM-DD' o null
    scheduleMode = 'flexible',
    preferredDays = null, // array de ints 0-6 o null
    linkedAssignmentId = null,
  }
) {
  if (!templateId) throw new Error('assignTemplateToStudent: templateId requerido')
  if (!studentId) throw new Error('assignTemplateToStudent: studentId requerido')

  // El back rechaza days en flexible (validate_preferred_days). Centralizamos.
  const isFixed = scheduleMode === 'fixed'
  const payload = {
    p_template_id: templateId,
    p_student_id: studentId,
    p_start_date: startDate || null, // null deja que el back use CURRENT_DATE
    p_end_date: endDate,
    p_schedule_mode: isFixed ? 'fixed' : 'flexible',
    p_preferred_days: isFixed && preferredDays?.length ? preferredDays : null,
    p_linked_assignment_id: linkedAssignmentId,
  }

  const { data, error } = await supabase.rpc('assign_template_to_student', payload)
  if (error) {
    throw enrichRpcError(error)
  }
  return data || {}
}

// Convierte errores de Postgres/Supabase en mensajes legibles para la coach.
// Conserva `code` y `details` originales para debugging.
export function enrichRpcError(error) {
  const code = error?.code
  const msg = error?.message || ''
  const friendly =
    code === '23514' && /plantilla/i.test(msg)
      ? 'No se puede asignar una plantilla directamente. Volvé a intentar — si el problema persiste, reportá este caso.'
      : code === '23514' && /is_template/i.test(msg)
        ? 'Ese plan no es una plantilla; no se puede clonar desde acá.'
        : code === '23503'
          ? 'No se encontró el plan o el alumno (referencia inválida).'
          : code === '23505'
            ? 'Ese alumno ya tiene un plan activo con esas condiciones. Reemplazá el actual desde el perfil del alumno.'
            : null

  const wrapped = new Error(friendly || msg || 'Error al asignar el plan')
  wrapped.code = code
  wrapped.original = error
  return wrapped
}

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
    (a) => (a.plan_type || a.plan?.plan_type || 'training') === 'training'
  )
  if (trainings.length === 0) return null

  const byCreated = (a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  }

  const active = trainings.filter((a) => getAssignmentStatus(a) === 'active').sort(byCreated)
  if (active.length > 0) return active[0]

  const paused = trainings.filter((a) => getAssignmentStatus(a) === 'paused').sort(byCreated)
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
  active: ['paused', 'completed', 'archived', 'replaced'],
  paused: ['active', 'completed', 'archived'],
  replaced: ['active'], // reactivar (con confirmación si hay otro activo)
  completed: ['active'], // reabrir
  archived: ['active'], // reactivar
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
        { key: 'pause', label: 'Pausar', tone: 'neutral', toStatus: 'paused' },
        { key: 'complete', label: 'Marcar completado', tone: 'success', toStatus: 'completed' },
        { key: 'archive', label: 'Archivar', tone: 'neutral', toStatus: 'archived' },
      ]
    case 'paused':
      return [
        { key: 'reactivate', label: 'Reactivar', tone: 'primary', toStatus: 'active' },
        { key: 'complete', label: 'Marcar completado', tone: 'success', toStatus: 'completed' },
        { key: 'archive', label: 'Archivar', tone: 'neutral', toStatus: 'archived' },
      ]
    case 'replaced':
    case 'completed':
    case 'archived':
      return [{ key: 'reactivate', label: 'Reactivar', tone: 'primary', toStatus: 'active' }]
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
    (a) => (a.plan_type || a.plan?.plan_type) === 'evaluation'
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

// ============================================================
// Días preferidos y adherencia semanal (migration v22)
// ============================================================
// Convención de días: 0=domingo, 1=lunes, ..., 6=sábado.
// Coincide con JavaScript Date.getDay() y con plan_assignments.preferred_days.
//
// schedule_mode:
//   - 'flexible': solo importa la cantidad de sesiones por semana.
//                 Adherencia = sesiones cumplidas / sessions_per_week.
//   - 'fixed':    días específicos definidos en preferred_days.
//                 Adherencia = días cumplidos en preferred_days /
//                              total de preferred_days dentro de la semana.

export const DAYS_OF_WEEK = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
]

export const SCHEDULE_MODES = {
  fixed: {
    key: 'fixed',
    label: 'Horario fijo',
    description: 'Días específicos de la semana. La adherencia se mide día por día.',
  },
  flexible: {
    key: 'flexible',
    label: 'Flexible',
    description: 'Solo importa cuántas sesiones cumple por semana, sin importar el día.',
  },
}

export function getScheduleMode(assignment) {
  if (!assignment) return 'flexible'
  return assignment.schedule_mode === 'fixed' ? 'fixed' : 'flexible'
}

// Devuelve siempre un array de ints únicos, ordenados, con valores 0-6.
// Tolera input desordenado, con duplicados, NULL, string JSON, o array JS.
export function normalizePreferredDays(input) {
  if (!input) return []
  let arr = input
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const valid = arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return [...new Set(valid)].sort((a, b) => a - b)
}

export function getPreferredDays(assignment) {
  return normalizePreferredDays(assignment?.preferred_days)
}

export function formatPreferredDays(days, { short = true } = {}) {
  const norm = normalizePreferredDays(days)
  if (norm.length === 0) return ''
  return norm.map((d) => (short ? DAYS_OF_WEEK[d].short : DAYS_OF_WEEK[d].label)).join(' · ')
}

// ── Manipulación de fechas (sin date-fns para evitar acoplamiento) ──
function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + days)
  return d
}

// Lunes como inicio de semana (ISO). Devuelve el lunes de la semana
// que contiene a `date`. Si `date` es domingo, devuelve el lunes anterior.
export function startOfWeekMonday(date) {
  const d = startOfDay(date)
  const dow = d.getDay() // 0=dom .. 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(d, diff)
}

export function endOfWeekSunday(date) {
  return addDays(startOfWeekMonday(date), 6)
}

function toYMD(date) {
  const d = startOfDay(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYMD(s) {
  if (!s) return null
  // 'YYYY-MM-DD' → Date local sin saltos de zona horaria.
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// ── Rango efectivo de la asignación dentro de [from, to] ──
// Recorta start_date / end_date contra la ventana solicitada.
function clampAssignmentRange(assignment, from, to) {
  const fromD = startOfDay(from)
  const toD = startOfDay(to)
  const startD = parseYMD(assignment?.start_date)
  const endD = parseYMD(assignment?.end_date)

  const effStart = startD && startD > fromD ? startD : fromD
  const effEnd = endD && endD < toD ? endD : toD
  if (effStart > effEnd) return null
  return { start: effStart, end: effEnd }
}

// ============================================================
// getExpectedSessionDates
// ------------------------------------------------------------
// Devuelve las fechas (YYYY-MM-DD) en las que el alumno debería
// haber entrenado dentro de [from, to], considerando preferred_days
// y el rango de vigencia de la asignación.
//
// Solo aplica para schedule_mode='fixed'. Para 'flexible' devuelve []
// porque no hay días específicos esperados.
// ============================================================
export function getExpectedSessionDates(assignment, from, to) {
  if (!assignment) return []
  if (getScheduleMode(assignment) !== 'fixed') return []

  const days = getPreferredDays(assignment)
  if (days.length === 0) return []

  const range = clampAssignmentRange(assignment, from, to)
  if (!range) return []

  const result = []
  const daySet = new Set(days)
  let cursor = startOfDay(range.start)
  const last = startOfDay(range.end)
  while (cursor <= last) {
    if (daySet.has(cursor.getDay())) {
      result.push(toYMD(cursor))
    }
    cursor = addDays(cursor, 1)
  }
  return result
}

// ============================================================
// computeWeekAdherence
// ------------------------------------------------------------
// Calcula la adherencia de UNA semana para UNA asignación.
//
// Parámetros:
//   assignment       — fila de plan_assignments (con preferred_days,
//                      schedule_mode, start_date, end_date,
//                      plan.sessions_per_week)
//   sessionDates     — array de YMD strings con las fechas en que
//                      el alumno tiene sesión registrada en esta
//                      semana (deduplicadas por día). El que llama
//                      es responsable de filtrar por student_id y
//                      plan_id si corresponde.
//   weekStart        — Date que cae cualquier día dentro de la
//                      semana objetivo. Se normaliza al lunes.
//   today (opcional) — Date considerada "hoy" (default new Date()).
//                      Sirve para distinguir días futuros (que no
//                      contamos como faltantes).
//
// Devuelve:
//   {
//     mode,           'fixed' | 'flexible' | 'inactive'
//     weekStart,      Date (lunes 00:00)
//     weekEnd,        Date (domingo 00:00)
//     expectedCount,  número de sesiones esperadas en la semana
//     completedCount, sesiones cumplidas (días distintos con sesión)
//     pendingCount,   esperadas - cumplidas que aún están en el futuro
//                     (solo modo fixed; en flexible siempre 0)
//     missedCount,    esperadas - cumplidas - pendientes
//     percentage,     0..1 sobre lo "decidible" (excluye pendientes)
//     status,         'good' | 'partial' | 'poor' | 'pending' | 'inactive'
//     expectedDates,  [YMD] solo si mode='fixed'
//     completedDates, [YMD] subset de sessionDates considerado
//   }
//
// Status:
//   inactive — la asignación no estuvo vigente en la semana.
//   pending  — la semana todavía no terminó y no hay datos suficientes
//              para juzgar (todas las sesiones esperadas son a futuro).
//   good     — adherencia >= 1 (cumplió todas o más).
//   partial  — > 0.5 y < 1 (más del 50%).
//   poor     — <= 0.5 (50% o menos).
// ============================================================
export function computeWeekAdherence(assignment, sessionDates, weekStart, today = new Date()) {
  const wStart = startOfWeekMonday(weekStart)
  const wEnd = endOfWeekSunday(weekStart)
  const todayD = startOfDay(today)

  const range = clampAssignmentRange(assignment, wStart, wEnd)
  if (!range) {
    return {
      mode: 'inactive',
      weekStart: wStart,
      weekEnd: wEnd,
      expectedCount: 0,
      completedCount: 0,
      pendingCount: 0,
      missedCount: 0,
      percentage: 0,
      status: 'inactive',
      expectedDates: [],
      completedDates: [],
    }
  }

  const sessionSet = new Set((sessionDates || []).map((s) => String(s).slice(0, 10)))
  const mode = getScheduleMode(assignment)

  if (mode === 'fixed') {
    const expectedDates = getExpectedSessionDates(assignment, wStart, wEnd)
    const expectedCount = expectedDates.length

    const completedDates = expectedDates.filter((d) => sessionSet.has(d))
    const completedCount = completedDates.length

    // Pendiente = esperada todavía en el futuro respecto a "hoy".
    const pendingCount = expectedDates.filter((d) => {
      const dd = parseYMD(d)
      return dd && dd > todayD && !sessionSet.has(d)
    }).length

    const decidible = expectedCount - pendingCount
    const missedCount = Math.max(0, decidible - completedCount)
    const percentage = decidible > 0 ? completedCount / decidible : 0

    let status
    if (expectedCount === 0) status = 'inactive'
    else if (decidible === 0) status = 'pending'
    else if (percentage >= 1) status = 'good'
    else if (percentage > 0.5) status = 'partial'
    else status = 'poor'

    return {
      mode,
      weekStart: wStart,
      weekEnd: wEnd,
      expectedCount,
      completedCount,
      pendingCount,
      missedCount,
      percentage,
      status,
      expectedDates,
      completedDates,
    }
  }

  // ── modo flexible ───────────────────────────────────────────
  const sessionsPerWeek = Number(
    assignment?.plan?.sessions_per_week ?? assignment?.sessions_per_week ?? 0
  )
  const expectedCount = Number.isFinite(sessionsPerWeek) ? sessionsPerWeek : 0

  // Solo cuentan sesiones DENTRO de la ventana efectiva de la asignación.
  const completedDates = []
  for (const ymd of sessionSet) {
    const d = parseYMD(ymd)
    if (d && d >= range.start && d <= range.end) completedDates.push(ymd)
  }
  const completedCount = completedDates.length

  // En flexible no hay días esperados específicos, así que no podemos
  // distinguir "pendientes futuras" del mismo modo que en fixed.
  // Aproximación: si la semana no terminó y la cantidad cumplida ya
  // alcanza, status 'good'; si no, status 'pending' hasta que termine.
  const weekFinished = todayD > wEnd
  const percentage = expectedCount > 0 ? Math.min(1, completedCount / expectedCount) : 0
  const missedCount = weekFinished ? Math.max(0, expectedCount - completedCount) : 0

  let status
  if (expectedCount === 0) status = 'inactive'
  else if (percentage >= 1) status = 'good'
  else if (!weekFinished) status = 'pending'
  else if (percentage > 0.5) status = 'partial'
  else status = 'poor'

  return {
    mode,
    weekStart: wStart,
    weekEnd: wEnd,
    expectedCount,
    completedCount,
    pendingCount: 0,
    missedCount,
    percentage,
    status,
    expectedDates: [],
    completedDates,
  }
}

// ============================================================
// Tokens visuales por estado de semana (consumidos por el calendario)
// ------------------------------------------------------------
// Decisiones de paleta:
//   - rojo "puro" se evita en fitness (genera ansiedad). Usamos coral.
//   - el ámbar está ligeramente más cálido que amarillo para mejor
//     contraste en mobile.
//   - 'pending' usa neutro suave + animación opcional en el render.
// Cada token incluye text/bg/border/dot para usar en distintos
// contextos (badge, celda de calendario, marcador de día).
// ============================================================
export const WEEK_STATUS_STYLE = {
  good: {
    label: 'Cumplida',
    icon: '✓',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-100',
    borderClass: 'border-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  partial: {
    label: 'Parcial',
    icon: '◐',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-100',
    borderClass: 'border-amber-300',
    dotClass: 'bg-amber-500',
  },
  poor: {
    label: 'Baja',
    icon: '✗',
    textClass: 'text-rose-700',
    bgClass: 'bg-rose-100',
    borderClass: 'border-rose-300',
    dotClass: 'bg-rose-500',
  },
  pending: {
    label: 'En curso',
    icon: '○',
    textClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-200',
    dotClass: 'bg-slate-400',
  },
  inactive: {
    label: 'Sin plan',
    icon: '–',
    textClass: 'text-gray-400',
    bgClass: 'bg-gray-50',
    borderClass: 'border-gray-200',
    dotClass: 'bg-gray-300',
  },
}

export function weekStatusStyle(status) {
  return WEEK_STATUS_STYLE[status] || WEEK_STATUS_STYLE.inactive
}
