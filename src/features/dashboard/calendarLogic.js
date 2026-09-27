// ============================================================
// calendarLogic.js
// ------------------------------------------------------------
// Funciones puras que alimentan el calendario del coach.
// Están en un módulo aparte (sin React ni Supabase) para que
// puedan importarse en scripts standalone (verificación,
// tests futuros) sin arrastrar todo el hook.
//
// El hook useCoachCalendarData re-exporta estas funciones para
// mantener compatibilidad con quien las importa desde ahí.
// ============================================================

import { startOfWeekMonday } from '@/features/plans/assignmentHelpers'

// ── Constantes locales ───────────────────────────────────────
const SCHED_FIXED = 'fixed'
const SCHED_FLEXIBLE = 'flexible'

// ── Date utils ───────────────────────────────────────────────
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

function toYMD(date) {
  const d = startOfDay(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYMD(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// ============================================================
// COACH_EVENT_KIND — cómo se muestra cada evento del coach
// ------------------------------------------------------------
// Rediseño 2026-09-26: el calendario ya no usa puntitos de color.
// Cada evento se escribe con palabras en una etiqueta pastel. Los textos
// viven en i18n (coach.dashboard.calendar.kinds.<tipo>.*):
//   label      nombre completo ("Fin de plan")
//   legend     cómo se nombra en la leyenda (igual a label si no difiere)
//   short      palabra corta para el teléfono ("Fin")
//   tagClass   fondo + texto de la etiqueta (identidad durazno)
//   lateClass  el mismo evento cuando ya pasó sin resolverse
//              (pago o fin de plan atrasado)
// ============================================================
const LATE_TAG = 'bg-[#fee2e2] text-[#b91c1c]'

export const COACH_EVENT_KIND = {
  plan_start: {
    tagClass: 'bg-[#dcfce7] text-[#15803d]',
    lateClass: 'bg-[#dcfce7] text-[#15803d]',
  },
  plan_end: {
    tagClass: 'bg-gray-100 text-gray-700',
    lateClass: LATE_TAG,
  },
  payment_due: {
    tagClass: 'bg-durazno-100 text-primary-800',
    lateClass: LATE_TAG,
  },
  // Pendiente: recuadro blanco con borde ciruela (todavía no pasó).
  // Si la fecha agendada ya pasó sin hacerse → rojo pastel.
  evaluation: {
    tagClass: 'bg-white border border-ciruela-200 text-ciruela-700',
    lateClass: LATE_TAG,
  },
  // Hecha (2026-09-26): va en el día en que se hizo (eval_date de
  // evaluation_results), relleno ciruela y con tilde.
  evaluation_done: {
    tagClass: 'bg-ciruela-100 text-ciruela-700',
    lateClass: 'bg-ciruela-100 text-ciruela-700',
  },
  // ── Formularios (2026-09-27) ─────────────────────────────
  // Cada formulario aparece UNA sola vez, según su estado (pedido de
  // Franco: "para que no ensucie"):
  //   programado    todavía no llegó su día y no se respondió
  //   sin responder ya llegó su día (o se envió) y no se respondió;
  //                 va en el día en que se envió; ámbar desde los 7 días
  //   respondido    en el día en que la persona lo respondió
  form_scheduled: {
    tagClass: 'bg-white border border-[#d8ccc1] text-[#5a4b42]',
    lateClass: 'bg-white border border-[#d8ccc1] text-[#5a4b42]',
  },
  form_unanswered: {
    tagClass: 'bg-[#f5f0eb] text-[#5a4b42]',
    lateClass: 'bg-[#fef3c7] text-[#92400e]',
  },
  form_answered: {
    tagClass: 'bg-[#f5f0eb] text-[#5a4b42]',
    lateClass: 'bg-[#f5f0eb] text-[#5a4b42]',
  },
  // ── Pago cobrado (2026-09-27): el día en que se registró el cobro ──
  payment_done: {
    tagClass: 'bg-durazno-100 text-primary-800',
    lateClass: 'bg-durazno-100 text-primary-800',
  },
  // ── La persona (2026-09-27) ──────────────────────────────
  // Actividad extra: lo que la persona cargó por su cuenta. La etiqueta
  // lleva el emoji de la actividad (ev.emoji) en vez de una palabra.
  activity: {
    tagClass: 'bg-niebla-100 text-niebla-700',
    lateClass: 'bg-niebla-100 text-niebla-700',
  },
  // Festejo: semana completa, cierre de plan, racha, mejor marca.
  // Los festejos conservan el emoji (decisión de Franco).
  milestone: {
    tagClass: 'bg-durazno-50 border border-durazno-200 text-primary-700',
    lateClass: 'bg-durazno-50 border border-durazno-200 text-primary-700',
  },
  birthday: {
    tagClass: 'bg-durazno-50 border border-durazno-200 text-primary-700',
    lateClass: 'bg-durazno-50 border border-durazno-200 text-primary-700',
  },
}

// Orden en que se listan los eventos dentro de un mismo día.
export const COACH_EVENT_ORDER = [
  'payment_due',
  'plan_end',
  'evaluation',
  'form_unanswered',
  'form_scheduled',
  'plan_start',
  'evaluation_done',
  'form_answered',
  'payment_done',
  'milestone',
  'birthday',
  'activity',
]

// ============================================================
// Temas del calendario (2026-09-27)
// ------------------------------------------------------------
// La leyenda son interruptores agrupados por tema. 'trained' no es un
// evento: es el "N entrenaron" de cada día pasado (modo todas).
// DEFAULT_HIDDEN: lo que arranca apagado (decisión de Franco).
// ============================================================
export const CALENDAR_GROUPS = [
  // Nombre de cada tema: coach.dashboard.calendar.groups.<key>
  { key: 'plans', kinds: ['plan_start', 'plan_end'] },
  { key: 'evaluations', kinds: ['evaluation', 'evaluation_done'] },
  { key: 'forms', kinds: ['form_scheduled', 'form_unanswered', 'form_answered'] },
  { key: 'payments', kinds: ['payment_due', 'payment_done'] },
  { key: 'person', kinds: ['trained', 'activity', 'milestone', 'birthday'] },
]

// 2026-09-27: festejos también arrancan apagados (pedido de Franco).
export const DEFAULT_HIDDEN = ['form_unanswered', 'form_answered', 'milestone']

// Lo que ya pasó no va en "Próximos 7 días".
export const PAST_ONLY_KINDS = new Set([
  'evaluation_done',
  'form_unanswered',
  'form_answered',
  'payment_done',
  'activity',
  'milestone',
])

// A partir de cuántos días un formulario sin responder se marca en ámbar
// (y entra en "Necesitan atención").
export const FORM_UNANSWERED_WARN_DAYS = 7

// Filtra un Map<YMD, CoachEvent[]> sacando los tipos apagados.
export function filterEventsByDate(eventsByDate, hidden) {
  const h = hidden instanceof Set ? hidden : new Set(hidden || [])
  if (h.size === 0) return eventsByDate
  const out = new Map()
  for (const [ymd, arr] of eventsByDate || []) {
    const keep = arr.filter((e) => !h.has(e.type))
    if (keep.length > 0) out.set(ymd, keep)
  }
  return out
}

// Timestamp (con hora) → día local.
function tsToDay(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return startOfDay(d)
}

function daysBetween(later, earlier) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / 86400000)
}

// Qué dice un festejo, en una frase corta. `m` = { kind, payload };
// `t` = función de i18next (claves coach.dashboard.milestones.*).
export function milestoneText(m, t) {
  const p = m?.payload || {}
  const M = 'coach.dashboard.milestones.'
  switch (m?.kind) {
    case 'week_complete':
      return t(M + 'weekComplete')
    case 'plan_complete':
      return t(M + 'planComplete')
    case 'streak': {
      const w = Number(p.weeks)
      return Number.isFinite(w) && w > 0 ? t(M + 'streak', { count: w }) : t(M + 'streakGeneric')
    }
    case 'personal_best':
      return p.exercise_name
        ? t(M + 'personalBestIn', { exercise: p.exercise_name })
        : t(M + 'personalBest')
    default:
      return t(M + 'generic')
  }
}

export const MILESTONE_KINDS_IN_CALENDAR = [
  'week_complete',
  'plan_complete',
  'streak',
  'personal_best',
]

// ============================================================
// STUDENT_DAY_STYLE — estado del día de UNA persona
// ------------------------------------------------------------
// El día entero se pinta con el estado (cellClass) y lleva ícono +
// palabra (textClass). Pasteles de la identidad; el estado se lee
// también por el ícono, nunca solo por el color.
// ============================================================
export const STUDENT_DAY_STYLE = {
  planned_done: {
    labelKey: 'coach.dashboard.calendar.dayStatus.planned_done',
    icon: '✓',
    cellClass: 'bg-[#dcfce7] border-[#bbf7d0]',
    textClass: 'text-[#15803d]',
  },
  planned_partial: {
    labelKey: 'coach.dashboard.calendar.dayStatus.planned_partial',
    icon: '½',
    cellClass: 'bg-[#fef3c7] border-[#fde68a]',
    textClass: 'text-[#92400e]',
  },
  planned_missed: {
    labelKey: 'coach.dashboard.calendar.dayStatus.planned_missed',
    icon: '×',
    cellClass: 'bg-[#fee2e2] border-[#fecaca]',
    textClass: 'text-[#b91c1c]',
  },
  planned_future: {
    labelKey: 'coach.dashboard.calendar.dayStatus.planned_future',
    icon: '○',
    cellClass: 'bg-white border-dashed border-gray-300',
    textClass: 'text-gray-500',
  },
  unplanned_done: {
    labelKey: 'coach.dashboard.calendar.dayStatus.unplanned_done',
    icon: '+',
    cellClass: 'bg-niebla-100 border-niebla-200',
    textClass: 'text-niebla-700',
  },
  unplanned_partial: {
    labelKey: 'coach.dashboard.calendar.dayStatus.unplanned_partial',
    icon: '½',
    cellClass: 'bg-[#fef3c7] border-[#fde68a]',
    textClass: 'text-[#92400e]',
  },
  rest: {
    labelKey: 'coach.dashboard.calendar.dayStatus.rest',
    icon: '',
    cellClass: '',
    textClass: '',
  },
}

// ============================================================
// getCalendarWindow
// ------------------------------------------------------------
// Rango visible del calendario para un mes anclado:
// lunes de la semana que contiene al día 1 → domingo de la
// semana que contiene al último día del mes.
// ============================================================
function startOfMonth(date) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}
function endOfMonth(date) {
  const d = startOfDay(date)
  d.setMonth(d.getMonth() + 1, 0)
  return d
}
function endOfWeekSunday(date) {
  return addDays(startOfWeekMonday(date), 6)
}
export function getCalendarWindow(monthAnchor) {
  const first = startOfMonth(monthAnchor)
  const last = endOfMonth(monthAnchor)
  return {
    start: startOfWeekMonday(first),
    end: endOfWeekSunday(last),
  }
}

// ============================================================
// computeCalendarEvents (PURA — testeable sin Supabase)
// ------------------------------------------------------------
// Inputs:
//   students     [{ id, name, birth_date, next_payment_due }]
//   assignments  [{ id, student_id, start_date, expected_end_date,
//                   plan: { title } }]
//   window       { start: Date, end: Date }
//   today        Date (para marcar `late` en pagos y fines de plan
//                que ya pasaron sin resolverse)
//
// Las asignaciones de EVALUACIÓN no generan inicio/fin de plan: generan
// un evento 'evaluation' en su start_date, si siguen pendientes (mismo
// criterio que tenía la lista "Próximas evaluaciones"). Si la fecha ya
// pasó y sigue pendiente, va marcada `late`.
//
//   evalResults  [{ student_id, plan_id, eval_date, plan?: { title } }]
//                evaluaciones HECHAS (evaluation_results). Cada una es un
//                evento 'evaluation_done' en el día en que se hizo, y
//                apaga el pendiente de esa misma persona y plan aunque la
//                asignación no haya pasado a 'completed'.
//
//   extras (2026-09-27, todo opcional):
//     forms       [{ id, student_id, status, sent_at, scheduled_for,
//                    completed_at, form_kind, template?: { name } }]
//                 cada formulario va UNA vez según su estado (ver
//                 COACH_EVENT_KIND.form_*)
//     payments    [{ student_id, paid_on }]           → payment_done
//     activities  [{ student_id, date, emoji, name }] → activity
//     milestones  [{ student_id, kind, created_at, payload }] → milestone
//
// Output: Map<YMD, CoachEvent[]>, cada día ordenado por COACH_EVENT_ORDER
//   CoachEvent: { type, date, studentId, studentName, planTitle?,
//                 titleFallback?, late?, daysWaiting?, emoji?, milestone? }
//   Sin texto armado: la UI lo traduce (agendaPhrase / eventTitle).
//   titleFallback: qué nombre genérico usar si no hay planTitle
//   ('plan' | 'evaluation' | 'intakeForm' | 'followUpForm' | 'activity').
// ============================================================
const EVAL_DONE_STATUSES = new Set(['archived', 'completed', 'replaced'])

export function computeCalendarEvents(
  students,
  assignments,
  window,
  today = new Date(),
  evalResults = [],
  extras = {}
) {
  const map = new Map()
  const push = (ymd, ev) => {
    if (!map.has(ymd)) map.set(ymd, [])
    map.get(ymd).push(ev)
  }

  const startD = startOfDay(window.start)
  const endD = startOfDay(window.end)

  const todayD = startOfDay(today)

  const inWindow = (d) => d >= startD && d <= endD

  // Evaluaciones hechas, por persona + plan (para apagar el pendiente).
  const evalDoneKeys = new Set(
    (evalResults || []).filter((r) => r.plan_id).map((r) => `${r.student_id}|${r.plan_id}`)
  )

  // ── Plan starts / ends / evaluaciones ───────────────────────
  for (const a of assignments || []) {
    const student = (students || []).find((s) => s.id === a.student_id)
    const studentName = student?.name || '—'
    // Sin título → la UI pone "Plan" traducido (titleFallback).
    const planTitle = a.plan?.title || null
    const titleFallback = planTitle ? undefined : 'plan'

    const planType = a.plan_type || a.plan?.plan_type || 'training'
    if (planType === 'evaluation') {
      const evd = parseYMD(a.start_date)
      const done =
        EVAL_DONE_STATUSES.has(a.status) || evalDoneKeys.has(`${a.student_id}|${a.plan_id}`)
      if (evd && inWindow(evd) && !done) {
        push(toYMD(evd), {
          type: 'evaluation',
          date: toYMD(evd),
          studentId: a.student_id,
          studentName,
          planTitle,
          titleFallback,
          late: evd < todayD,
        })
      }
      continue
    }

    const sd = parseYMD(a.start_date)
    if (sd && inWindow(sd)) {
      push(toYMD(sd), {
        type: 'plan_start',
        date: toYMD(sd),
        studentId: a.student_id,
        studentName,
        planTitle,
        titleFallback,
      })
    }
    // Vencimiento previsto (v48), no el cierre real: al coach le sirve
    // ver lo que viene, y el cierre siempre está en el pasado.
    // Solo en asignaciones VIGENTES: una reemplazada o archivada conserva
    // su expected_end_date y pintaría "Vence" un plan que ya no se entrena.
    const asgStatus = a.status || (a.active ? 'active' : null)
    const asgIsLive = asgStatus === 'active' || asgStatus === 'paused'
    const ed = asgIsLive ? parseYMD(a.expected_end_date) : null
    if (ed && inWindow(ed)) {
      push(toYMD(ed), {
        type: 'plan_end',
        date: toYMD(ed),
        studentId: a.student_id,
        studentName,
        planTitle,
        titleFallback,
        late: ed < todayD,
      })
    }
  }

  // ── Evaluaciones hechas (en el día en que se hicieron) ─────
  // Una por persona + plan + día aunque haya varias filas. Solo de
  // personas de la lista (activas), igual que el resto de los eventos.
  const seenDone = new Set()
  for (const r of evalResults || []) {
    const d = parseYMD(r.eval_date)
    if (!d || !inWindow(d)) continue
    const student = (students || []).find((s) => s.id === r.student_id)
    if (!student) continue
    const ymd = toYMD(d)
    const key = `${r.student_id}|${r.plan_id || ''}|${ymd}`
    if (seenDone.has(key)) continue
    seenDone.add(key)
    const planTitle =
      r.plan?.title || (assignments || []).find((a) => a.plan_id === r.plan_id)?.plan?.title || null
    push(ymd, {
      type: 'evaluation_done',
      date: ymd,
      studentId: r.student_id,
      studentName: student.name,
      planTitle,
      titleFallback: planTitle ? undefined : 'evaluation',
    })
  }

  // ── Vencimientos de pago ────────────────────────────────────
  for (const s of students || []) {
    const pd = parseYMD(s.next_payment_due)
    if (pd && inWindow(pd)) {
      push(toYMD(pd), {
        type: 'payment_due',
        date: toYMD(pd),
        studentId: s.id,
        studentName: s.name,
        late: pd < todayD,
      })
    }
  }

  // ── Cumpleaños (recurrente anual) ───────────────────────────
  const birthdayIndex = new Map()
  for (const s of students || []) {
    const bd = parseYMD(s.birth_date)
    if (!bd) continue
    const key = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
    if (!birthdayIndex.has(key)) birthdayIndex.set(key, [])
    birthdayIndex.get(key).push(s)
  }
  if (birthdayIndex.size > 0) {
    let cursor = startOfDay(startD)
    while (cursor <= endD) {
      const k = `${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      const matches = birthdayIndex.get(k)
      if (matches) {
        const ymd = toYMD(cursor)
        for (const s of matches) {
          push(ymd, {
            type: 'birthday',
            date: ymd,
            studentId: s.id,
            studentName: s.name,
          })
        }
      }
      cursor = addDays(cursor, 1)
    }
  }

  // Solo personas de la lista (activas), como el resto de los eventos.
  const studentById = new Map((students || []).map((s) => [s.id, s]))

  // ── Formularios: uno por formulario, según su estado ───────
  for (const f of extras.forms || []) {
    const student = studentById.get(f.student_id)
    if (!student) continue
    const formTitle = f.template?.name || null
    const base = {
      studentId: f.student_id,
      studentName: student.name,
      planTitle: formTitle,
      titleFallback: formTitle
        ? undefined
        : f.form_kind === 'intake'
          ? 'intakeForm'
          : 'followUpForm',
    }
    const done = f.status === 'completed' || !!f.completed_at
    if (done) {
      const d = tsToDay(f.completed_at)
      if (d && inWindow(d)) {
        push(toYMD(d), {
          ...base,
          type: 'form_answered',
          date: toYMD(d),
        })
      }
      continue
    }
    // Su día: la fecha programada o, si fue manual, la del envío.
    const d = tsToDay(f.scheduled_for) || tsToDay(f.sent_at) || tsToDay(f.created_at)
    if (!d || !inWindow(d)) continue
    if (d > todayD) {
      push(toYMD(d), {
        ...base,
        type: 'form_scheduled',
        date: toYMD(d),
      })
    } else {
      const daysWaiting = daysBetween(todayD, d)
      push(toYMD(d), {
        ...base,
        type: 'form_unanswered',
        date: toYMD(d),
        daysWaiting,
        late: daysWaiting >= FORM_UNANSWERED_WARN_DAYS,
      })
    }
  }

  // ── Pagos cobrados ─────────────────────────────────────────
  const seenPaid = new Set()
  for (const p of extras.payments || []) {
    const student = studentById.get(p.student_id)
    const d = parseYMD(p.paid_on)
    if (!student || !d || !inWindow(d)) continue
    const ymd = toYMD(d)
    const key = `${p.student_id}|${ymd}`
    if (seenPaid.has(key)) continue
    seenPaid.add(key)
    push(ymd, {
      type: 'payment_done',
      date: ymd,
      studentId: p.student_id,
      studentName: student.name,
    })
  }

  // ── Actividades extra ──────────────────────────────────────
  for (const a of extras.activities || []) {
    const student = studentById.get(a.student_id)
    const d = parseYMD(a.date)
    if (!student || !d || !inWindow(d)) continue
    const ymd = toYMD(d)
    push(ymd, {
      type: 'activity',
      date: ymd,
      studentId: a.student_id,
      studentName: student.name,
      emoji: a.emoji || '✨',
      planTitle: a.name || null,
      titleFallback: a.name ? undefined : 'activity',
    })
  }

  // ── Festejos (una vez por persona + tipo + día) ────────────
  const seenMilestone = new Set()
  for (const m of extras.milestones || []) {
    if (!MILESTONE_KINDS_IN_CALENDAR.includes(m.kind) || m.voided_at) continue
    const student = studentById.get(m.student_id)
    const d = tsToDay(m.created_at)
    if (!student || !d || !inWindow(d)) continue
    const ymd = toYMD(d)
    const p = m.payload || {}
    const key = `${m.student_id}|${m.kind}|${ymd}|${p.weeks ?? ''}|${p.exercise_name ?? ''}`
    if (seenMilestone.has(key)) continue
    seenMilestone.add(key)
    push(ymd, {
      type: 'milestone',
      date: ymd,
      studentId: m.student_id,
      studentName: student.name,
      // El texto sale de milestoneText(ev.milestone, t) en la UI.
      milestone: { kind: m.kind, payload: m.payload || null },
    })
  }

  for (const arr of map.values()) {
    arr.sort((x, y) => COACH_EVENT_ORDER.indexOf(x.type) - COACH_EVENT_ORDER.indexOf(y.type))
  }
  return map
}

// ============================================================
// computeStudentDayStatus (PURA — testeable)
// ------------------------------------------------------------
// Determina el estado de UN día para UN alumno. Usado en modo
// individual (1 alumno seleccionado) para colorear cada celda.
//
// Inputs:
//   ymd               'YYYY-MM-DD'
//   expectedSet       Set<YMD>   días esperados en la ventana
//                                (preferred_days en modo fixed; vacío en flexible).
//   completedSet      Set<YMD>   días con sesión registrada
//   today             Date       referencia de "hoy"
//   opts              { scheduleMode, flexibleOverflowSet, partialSet }
//
// partialSet (2026-08-27): días con sesión que NO llegaron a completar
// el entrenamiento (ver computeDateCompleteness). Antes cualquier día con
// sesión se pintaba "Cumplido": Andrea entrenaba solo la activación y la
// coach la veía verde. Sin partialSet el comportamiento es el de antes.
//
// Output: 'planned_done' | 'planned_partial' | 'planned_missed'
//       | 'planned_future' | 'unplanned_done' | 'unplanned_partial' | 'rest'
// ============================================================
export function computeStudentDayStatus(ymd, expectedSet, completedSet, today, opts = {}) {
  const scheduleMode = opts.scheduleMode === SCHED_FLEXIBLE ? SCHED_FLEXIBLE : SCHED_FIXED
  const isDone = completedSet.has(ymd)
  const isPartial = !!opts.partialSet && opts.partialSet.has(ymd)

  // ── Modo flexible ─────────────────────────────────────────
  if (scheduleMode === SCHED_FLEXIBLE) {
    if (!isDone) return 'rest'
    const overflow = opts.flexibleOverflowSet
    if (overflow && overflow.has(ymd)) return isPartial ? 'unplanned_partial' : 'unplanned_done'
    return isPartial ? 'planned_partial' : 'planned_done'
  }

  // ── Modo fixed ────────────────────────────────────────────
  const isExpected = expectedSet.has(ymd)
  if (isExpected && isDone) return isPartial ? 'planned_partial' : 'planned_done'
  if (isExpected && !isDone) {
    const d = parseYMD(ymd)
    if (d && d > startOfDay(today)) return 'planned_future'
    return 'planned_missed'
  }
  if (!isExpected && isDone) return isPartial ? 'unplanned_partial' : 'unplanned_done'
  return 'rest'
}

// ============================================================
// computeFlexibleOverflowSet (PURA)
// ------------------------------------------------------------
// Para una asignación flexible, calcula qué días de los entrenados
// quedan "fuera del cupo" semanal:
//
//   - Agrupar fechas por semana ISO (lunes-domingo).
//   - Ordenar cronológicamente cada semana.
//   - Las primeras `sessions_per_week` cuentan como cumplidas.
//   - Las que sobran, van al overflow set ("día extra").
//
// IMPORTANTE: el caller es responsable de pasar SOLO las fechas
// del plan activo de training. Sesiones de planes 'replaced',
// 'completed', o de evaluaciones inflarían el conteo y producirían
// falsos "Día extra" — ese fue el bug del 2026-05-10. Ver el fix
// en useCoachCalendarData.js (filtro por plan_id en el query).
// ============================================================
export function computeFlexibleOverflowSet(completedSet, sessionsPerWeek) {
  const out = new Set()
  const cap = Number(sessionsPerWeek)
  if (!Number.isFinite(cap) || cap <= 0) return out
  if (!completedSet || completedSet.size === 0) return out

  // Agrupamos por clave de semana (YMD del lunes).
  const byWeek = new Map()
  for (const ymd of completedSet) {
    const d = parseYMD(ymd)
    if (!d) continue
    const wk = toYMD(startOfWeekMonday(d))
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk).push(ymd)
  }

  for (const ymds of byWeek.values()) {
    ymds.sort()
    for (let i = cap; i < ymds.length; i++) {
      out.add(ymds[i])
    }
  }
  return out
}

// ============================================================
// Agenda de los próximos días (rediseño 2026-09-26)
// ------------------------------------------------------------
// buildAgendaDays: de un Map<YMD, CoachEvent[]> saca la lista de días
// CON eventos entre `start` y `start + days - 1`, en orden.
// agendaPhrase: cómo se escribe cada evento en la agenda, en frase
// ("Vence el pago de Tomás"). Devuelve { lead, name, detail }.
// ============================================================
export function buildAgendaDays(eventsByDate, start, days = 7, studentId = null, hidden = null) {
  const out = []
  const h = hidden instanceof Set ? hidden : new Set(hidden || [])
  let cursor = startOfDay(start)
  for (let i = 0; i < days; i++) {
    const ymd = toYMD(cursor)
    // La agenda es lo que viene: lo que ya pasó (evaluación hecha,
    // formulario respondido, pago cobrado…) no va. Respeta los
    // interruptores del calendario.
    let events = (eventsByDate?.get(ymd) || []).filter(
      (e) => !PAST_ONLY_KINDS.has(e.type) && !h.has(e.type)
    )
    if (studentId) events = events.filter((e) => e.studentId === studentId)
    if (events.length > 0) out.push({ ymd, events })
    cursor = addDays(cursor, 1)
  }
  return out
}

// Nombre de lo que trae el evento (plan, formulario, actividad, festejo),
// con el genérico traducido cuando no hay título propio.
export function eventTitle(ev, t) {
  if (ev?.type === 'milestone') return milestoneText(ev.milestone, t)
  if (ev?.planTitle) return ev.planTitle
  return ev?.titleFallback ? t(`coach.dashboard.fallback.${ev.titleFallback}`) : ''
}

// Frase de la agenda / del detalle del día: "<lead> <b>name</b>" + detalle.
// `t` = función de i18next (claves coach.dashboard.phrase.*).
export function agendaPhrase(ev, t) {
  const P = 'coach.dashboard.phrase.'
  const name = ev.studentName || ''
  const title = eventTitle(ev, t)
  switch (ev.type) {
    case 'payment_due':
      return { lead: t(P + (ev.late ? 'paymentLate' : 'payment')), name, detail: '' }
    case 'plan_end':
      return { lead: t(P + (ev.late ? 'planEndLate' : 'planEnd')), name, detail: title }
    case 'plan_start':
      return { lead: t(P + 'planStart'), name, detail: title }
    case 'evaluation':
      return { lead: t(P + (ev.late ? 'evaluationLate' : 'evaluation')), name, detail: title }
    case 'evaluation_done':
      return { lead: t(P + 'evaluationDone'), name, detail: title }
    case 'birthday':
      return { lead: t(P + 'birthday'), name, detail: '' }
    case 'form_scheduled':
      return { lead: t(P + 'formScheduled'), name, detail: title }
    case 'form_unanswered':
      return {
        lead: t(P + 'formUnanswered'),
        name,
        detail: ev.daysWaiting > 0 ? t(P + 'formWaiting', { title, count: ev.daysWaiting }) : title,
      }
    case 'form_answered':
      return { lead: t(P + 'formAnswered'), name, detail: title }
    case 'payment_done':
      return { lead: t(P + 'paymentDone'), name, detail: '' }
    case 'activity':
      return { lead: `${ev.emoji || '✨'} ${title}:`, name, detail: '' }
    case 'milestone':
      return { lead: `🎉 ${title}:`, name, detail: '' }
    default:
      return { lead: title, name, detail: '' }
  }
}
