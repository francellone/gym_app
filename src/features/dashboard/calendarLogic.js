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
// COACH_EVENT_KIND — paleta de eventos del coach
// ============================================================
export const COACH_EVENT_KIND = {
  plan_start: {
    label: 'Inicio de plan',
    icon: '▸',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  plan_end: {
    label: 'Fin de plan',
    icon: '◂',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-600',
  },
  payment_due: {
    label: 'Vencimiento de pago',
    icon: '$',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700',
  },
  birthday: {
    label: 'Cumpleaños',
    icon: '🎂',
    dotClass: 'bg-pink-400',
    textClass: 'text-pink-600',
  },
}

// ============================================================
// STUDENT_DAY_STYLE — paleta de estados de día por alumno
// ============================================================
export const STUDENT_DAY_STYLE = {
  planned_done: {
    label: 'Cumplido',
    icon: '✓',
    dotClass: 'bg-emerald-500',
    ringClass: 'ring-emerald-300',
  },
  planned_partial: {
    label: 'Parcial',
    icon: '◐',
    dotClass: 'bg-amber-400',
    ringClass: 'ring-amber-300',
  },
  planned_missed: {
    label: 'No asistió',
    icon: '✗',
    dotClass: 'bg-rose-500',
    ringClass: 'ring-rose-300',
  },
  planned_future: {
    label: 'Próximo',
    icon: '○',
    dotClass: 'bg-slate-300',
    ringClass: 'ring-slate-200',
  },
  unplanned_done: {
    label: 'Día extra',
    icon: '+',
    dotClass: 'bg-blue-400',
    ringClass: 'ring-blue-300',
  },
  unplanned_partial: {
    label: 'Día extra parcial',
    icon: '◐',
    dotClass: 'bg-amber-300',
    ringClass: 'ring-amber-200',
  },
  rest: { label: 'Descanso', icon: '·', dotClass: 'bg-transparent', ringClass: '' },
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
//   assignments  [{ id, student_id, start_date, end_date,
//                   plan: { title } }]
//   window       { start: Date, end: Date }
//
// Output: Map<YMD, CoachEvent[]>
// ============================================================
export function computeCalendarEvents(students, assignments, window) {
  const map = new Map()
  const push = (ymd, ev) => {
    if (!map.has(ymd)) map.set(ymd, [])
    map.get(ymd).push(ev)
  }

  const startD = startOfDay(window.start)
  const endD = startOfDay(window.end)

  const inWindow = (d) => d >= startD && d <= endD

  // ── Plan starts / ends ──────────────────────────────────────
  for (const a of assignments || []) {
    const student = (students || []).find((s) => s.id === a.student_id)
    const studentName = student?.name || '—'
    const planTitle = a.plan?.title || 'Plan'

    const sd = parseYMD(a.start_date)
    if (sd && inWindow(sd)) {
      push(toYMD(sd), {
        type: 'plan_start',
        date: toYMD(sd),
        title: `Inicia ${planTitle}`,
        studentId: a.student_id,
        studentName,
        planTitle,
      })
    }
    const ed = parseYMD(a.end_date)
    if (ed && inWindow(ed)) {
      push(toYMD(ed), {
        type: 'plan_end',
        date: toYMD(ed),
        title: `Fin de ${planTitle}`,
        studentId: a.student_id,
        studentName,
        planTitle,
      })
    }
  }

  // ── Vencimientos de pago ────────────────────────────────────
  for (const s of students || []) {
    const pd = parseYMD(s.next_payment_due)
    if (pd && inWindow(pd)) {
      push(toYMD(pd), {
        type: 'payment_due',
        date: toYMD(pd),
        title: `Vence pago: ${s.name}`,
        studentId: s.id,
        studentName: s.name,
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
            title: `Cumple ${s.name}`,
            studentId: s.id,
            studentName: s.name,
          })
        }
      }
      cursor = addDays(cursor, 1)
    }
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
