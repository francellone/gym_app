// Textos del chat que dependen de kind/payload (eventos) o del tipo de copia
// (etiquetas de lo guardado). Puro: recibe t de i18next.

import { dayLetter, linkKindOf } from './chatModel'

export function fmtNumber(v, lng) {
  if (v == null) return ''
  return Number(v).toLocaleString(lng === 'en' ? 'en-US' : 'es-AR', { maximumFractionDigits: 1 })
}

function bestValue(t, p, lng) {
  const v = fmtNumber(p.value, lng)
  if (p.metric === 'weight') return t('chat.event.valueKg', { value: v })
  if (p.metric === 'seconds') return t('chat.event.valueSeconds', { value: v })
  return t('chat.event.valueReps', { value: v })
}

export function eventTitle(t, event, { viewerRole, name, exerciseName, lng }) {
  const p = event?.payload || {}
  const you = viewerRole === 'student'
  const ctx = { name: name || t('chat.event.someone') }
  switch (event?.kind) {
    case 'day_complete': {
      const letter = dayLetter(p.day_id)
      return letter
        ? t(you ? 'chat.event.dayYou' : 'chat.event.day', { ...ctx, day: letter })
        : t(you ? 'chat.event.dayYouPlain' : 'chat.event.dayPlain', ctx)
    }
    case 'week_complete':
      return t(you ? 'chat.event.weekYou' : 'chat.event.week', ctx)
    case 'plan_complete':
      return t(you ? 'chat.event.planYou' : 'chat.event.plan', ctx)
    case 'personal_best':
      return t('chat.event.best', {
        exercise: exerciseName || p.exercise_name || t('chat.event.anExercise'),
        value: bestValue(t, p, lng),
      })
    case 'exercise_unclear':
      return t(you ? 'chat.event.unclearYou' : 'chat.event.unclear', {
        ...ctx,
        item: p.item_name || t('chat.event.anExercise'),
      })
    default:
      return ''
  }
}

export function eventDetail(t, event, lng) {
  const p = event?.payload || {}
  switch (event?.kind) {
    case 'week_complete':
      return p.expected
        ? t('chat.event.weekDetail', { completed: p.completed ?? p.expected, expected: p.expected })
        : ''
    case 'plan_complete':
      return p.plan_title || ''
    case 'personal_best':
      if (p.voided) return t('chat.event.bestVoided')
      return p.previous_max != null
        ? t('chat.event.bestBefore', { value: bestValue(t, { ...p, value: p.previous_max }, lng) })
        : ''
    case 'exercise_unclear':
      return p.skip_note ? `“${p.skip_note}”` : ''
    default:
      return ''
  }
}

export function linkLabel(t, copy, labels, viewerRole) {
  const kind = linkKindOf(copy)
  const ex = copy.exercise_id ? labels.exercises.get(copy.exercise_id)?.name : null
  if (kind === 'private') return t('chat.link.private')
  if (kind === 'exercise') {
    return viewerRole === 'student'
      ? t('chat.link.exerciseYou', { exercise: ex || '' })
      : t('chat.link.exercise', { exercise: ex || '' })
  }
  if (kind === 'plan_exercise') {
    const pe = labels.planExercises.get(copy.plan_exercise_id)
    const letter = dayLetter(pe?.section)
    const plan = labels.plans.get(copy.plan_id) || ''
    if (viewerRole === 'student') {
      return letter ? t('chat.link.planYou', { day: letter }) : t('chat.link.planYouPlain')
    }
    return letter
      ? t('chat.link.plan', { plan, day: letter, exercise: ex || '' })
      : t('chat.link.planPlain', { plan, exercise: ex || '' })
  }
  if (kind === 'plan_day') {
    const letter = dayLetter(copy.plan_section) || ''
    return viewerRole === 'student'
      ? t('chat.link.dayYou', { day: letter })
      : t('chat.link.day', { plan: labels.plans.get(copy.plan_id) || '', day: letter })
  }
  return ''
}

export function contextLabel(t, note, labels, fmtDate) {
  const ex = note.exercise_id ? labels.exercises.get(note.exercise_id)?.name : null
  const date = note.note_date ? fmtDate(note.note_date) : null
  // "Plan 4 Ana, Día B" del registro comentado (si se pudo resolver)
  const where = (planId, section) => {
    const plan = planId ? labels.plans.get(planId) : null
    const letter = dayLetter(section)
    if (plan && letter) return t('chat.context.planDay', { plan, day: letter })
    if (plan) return plan
    if (letter) return t('chat.dayShort', { day: letter })
    return null
  }
  const join = (...parts) => parts.filter(Boolean).join(' · ')
  switch (note.context_type) {
    case 'workout_log': {
      const log = labels.logs?.get(note.context_id)
      const pe = log?.plan_exercise_id ? labels.planExercises.get(log.plan_exercise_id) : null
      return (
        join(
          ex || t('chat.context.log'),
          where(log?.plan_id, pe?.section),
          date && t('chat.context.loggedOn', { date })
        ) || null
      )
    }
    case 'workout_block_log': {
      const bl = labels.blockLogs?.get(note.context_id)
      return join(
        bl?.block_title || t('chat.context.block'),
        where(bl?.plan_id, bl?.section),
        date && t('chat.context.loggedOn', { date })
      )
    }
    case 'exercise':
      return ex ? t('chat.context.exercise', { exercise: ex }) : null
    case 'evaluation_test':
    case 'evaluation_result':
      return t('chat.context.evaluation')
    default:
      return null
  }
}
