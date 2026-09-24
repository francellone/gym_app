// ============================================================
// celebrationModel.js — de hito a "qué se muestra" (Etapa 3)
// ------------------------------------------------------------
// Puro. Traduce un hito (el que acaba de otorgar award_milestone o uno
// pendiente de la base) a un modelo de pantalla: nivel visual, claves de
// i18n con sus variables, estadísticas y cuánto confeti. Los componentes
// solo pintan esto.
//
// Niveles (decisión Franco 2026-09-24, maqueta "Celebraciones de la app"):
//   toast  → día completo (se va solo)
//   sheet  → semana completa (hoja desde abajo, se cierra a mano)
//   full   → plan terminado (pantalla completa)
// El día parcial no pasa por acá: ya tiene su banner ámbar en Entrenar.
// ============================================================

import { groupExercisesIntoBlocks, DAY_SECTION_IDS } from '@/features/plans/helpers'
import {
  closedSessionDates,
  detectDayMilestone,
  detectWeekMilestone,
  detectPlanMilestone,
  buildWeekStatuses,
} from './milestoneRules'
import { isDayStateClosed } from '@/features/workouts/completionRules'

export const LEVEL_RANK = { toast: 1, sheet: 2, full: 3 }
export const CONFETTI = { toast: 60, sheet: 140, full: { strong: 220, good: 120, gentle: 0 } }
export const TOAST_MS = 4200

// Plan en bloques por sección (mismo armado que TodayWorkoutPage).
export function buildBlocksBySection(planExercises, planBlocks) {
  const bySection = {}
  for (const b of groupExercisesIntoBlocks(planExercises || [], planBlocks || [])) {
    if (!b.section) continue
    if (!bySection[b.section]) bySection[b.section] = []
    bySection[b.section].push(b)
  }
  return bySection
}

export function activeDaysOf(blocksBySection) {
  return DAY_SECTION_IDS.filter((id) => (blocksBySection?.[id] || []).length > 0)
}

// "day_b" → "B"
export function dayLetter(dayId) {
  return (
    String(dayId || '')
      .split('_')[1]
      ?.toUpperCase() || ''
  )
}

// ============================================================
// Candidatos en vivo al cerrar un día (complete o partial)
// ------------------------------------------------------------
// prevStates / nextStates: mapas día → estado de la FECHA guardada.
// activity: { logs, blockLogs } del plan (todas las fechas, ya incluye
// lo recién guardado). Devuelve la lista ordenada día → semana → plan.
// ============================================================
export function computeLiveCandidates({
  dayId,
  date,
  prevStates,
  nextStates,
  assignment,
  blocksBySection,
  activity,
  today,
} = {}) {
  const prevState = prevStates?.[dayId]
  const nextState = nextStates?.[dayId]
  if (!isDayStateClosed(nextState) || isDayStateClosed(prevState)) return []

  const out = []
  const dayM = detectDayMilestone({ prevState, nextState, date, dayId })
  if (dayM) out.push(dayM)

  const activeDays = activeDaysOf(blocksBySection)
  const closed = closedSessionDates({
    activeDays,
    blocksBySection,
    logs: activity?.logs,
    blockLogs: activity?.blockLogs,
  })
  // Antes del guardado la fecha ya contaba si OTRO día estaba cerrado.
  const otherWasClosed = Object.entries(prevStates || {}).some(
    ([id, st]) => id !== dayId && isDayStateClosed(st)
  )
  const prevClosed = otherWasClosed ? closed : closed.filter((d) => d !== date)
  const nextClosed = closed.includes(date) ? closed : [...closed, date].sort()

  const weekM = detectWeekMilestone({
    assignment,
    prevDates: prevClosed,
    nextDates: nextClosed,
    date,
    today,
  })
  if (weekM) out.push(weekM)

  const planM = detectPlanMilestone({
    assignment,
    closedDates: nextClosed,
    today,
    weekMilestone: weekM,
  })
  if (planM) out.push(enrichPlanCandidate(planM, { assignment, closedDates: nextClosed, today }))
  return out
}

// Suma al payload del plan lo que la pantalla de cierre necesita para
// poder mostrarse más tarde (hito pendiente) sin volver a calcular:
// semanas completas, título del plan y el mensaje de la coach.
export function enrichPlanCandidate(candidate, { assignment, closedDates, today } = {}) {
  const end = assignment?.expected_end_date
  const now = today || new Date()
  const until = end && new Date(`${end}T12:00:00`) < now ? new Date(`${end}T12:00:00`) : now
  const weeks = buildWeekStatuses({
    assignments: [assignment],
    closedDates,
    fromDate: assignment?.start_date,
    today: until,
  })
  return {
    ...candidate,
    payload: {
      ...candidate.payload,
      weeks_complete: weeks.filter((w) => w.status === 'complete').length,
      plan_title: assignment?.plan?.title ?? null,
      message: assignment?.plan?.completion_message ?? null,
    },
  }
}

// De varios hitos otorgados a la vez se muestra el de más nivel; los
// demás quedan registrados igual (y la coach recibe sus avisos).
export function pickTopCelebration(items) {
  let best = null
  for (const it of items || []) {
    if (!it) continue
    if (!best || LEVEL_RANK[it.level] > LEVEL_RANK[best.level]) best = it
  }
  return best
}

// ============================================================
// Hito → modelo de pantalla
// milestone: { id, kind, period_key, payload, created_by } (fila de la
// base o armado a partir del candidato + respuesta de la RPC).
// ============================================================
export function toCelebration(milestone, { studentId } = {}) {
  if (!milestone) return null
  const p = milestone.payload || {}
  const base = { id: milestone.id ?? null, kind: milestone.kind }
  const fromCoach = !!(milestone.created_by && studentId && milestone.created_by !== studentId)

  if (milestone.kind === 'day_complete') {
    return {
      ...base,
      level: 'toast',
      confetti: CONFETTI.toast,
      titleKey: 'celebrations.day.title',
      titleVars: { letter: dayLetter(p.day_id) },
      bodyKey: fromCoach ? 'celebrations.day.bodyFromCoach' : 'celebrations.day.body',
      bodyVars: { date: milestone.period_key },
      fromCoach,
    }
  }

  if (milestone.kind === 'week_complete') {
    const expected = Number(p.expected) || 0
    const completed = Number(p.completed) || expected
    return {
      ...base,
      level: 'sheet',
      confetti: CONFETTI.sheet,
      titleKey: 'celebrations.week.title',
      bodyKey: 'celebrations.week.body',
      bodyVars: { count: expected },
      weekStart: p.week_start ?? null,
      stats: [{ value: `${completed}/${expected}`, labelKey: 'celebrations.week.statSessions' }],
      fromCoach,
    }
  }

  if (milestone.kind === 'plan_complete') {
    const tone = ['strong', 'good', 'gentle'].includes(p.tone) ? p.tone : 'good'
    const hasAdh = Number(p.sessions_expected) > 0 && p.sessions_closed != null
    const perTen = hasAdh ? Math.round((Number(p.adherence) || 0) * 10) : null
    let bodyKey = 'celebrations.plan.bodyNoData'
    if (hasAdh)
      bodyKey =
        tone === 'gentle' ? 'celebrations.plan.body.gentle' : `celebrations.plan.body.${tone}`
    const stats = []
    if (hasAdh) {
      stats.push({
        value: `${p.sessions_closed}/${p.sessions_expected}`,
        labelKey: 'celebrations.plan.statSessions',
      })
    }
    if (p.weeks_complete != null) {
      stats.push({ value: String(p.weeks_complete), labelKey: 'celebrations.plan.statWeeks' })
    }
    return {
      ...base,
      level: 'full',
      tone,
      confetti: CONFETTI.full[tone],
      titleKey: `celebrations.plan.title.${tone}`,
      bodyKey,
      bodyVars: { n: perTen, closed: p.sessions_closed, expected: p.sessions_expected },
      planTitle: p.plan_title ?? null,
      message: p.message ?? null,
      autoMessageKey: `celebrations.plan.autoMessage.${tone === 'gentle' ? 'gentle' : 'default'}`,
      stats,
      fromCoach,
    }
  }
  return null
}
