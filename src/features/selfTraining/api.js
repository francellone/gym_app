// ============================================================
// Persona que entrena sin coach (v68)
// ------------------------------------------------------------
// - Registro libre ("hoy hice esto"): cada log cuelga de un plan implícito
//   por persona (plans.plan_type = 'free') que NO se asigna. La RPC
//   free_plan_exercise asegura el plan y el plan_exercise del ejercicio.
// - Plan propio: se arma con el armador de la coach (selfMode) y se asigna
//   con assign_template_to_student, igual que un plan de coach.
// ============================================================
import { format } from 'date-fns'
import { assignTemplateToStudent } from '@/features/plans/assignmentHelpers'

/** La persona no tiene coach (o es su propia coach, caso "ambas"). */
export function isSelfCoached(profile) {
  return Boolean(profile?.id) && (!profile.coach_id || profile.coach_id === profile.id)
}

/** Asegura plan libre + plan_exercise para el ejercicio. → { planId, planExerciseId } */
export async function ensureFreePlanExercise(supabase, exerciseId) {
  const { data, error } = await supabase.rpc('free_plan_exercise', { p_exercise_id: exerciseId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.plan_id || !row?.plan_exercise_id) throw new Error('free_plan_exercise sin resultado')
  return { planId: row.plan_id, planExerciseId: row.plan_exercise_id }
}

/** Id del plan libre de la persona, o null si todavía no registró nada libre. */
export async function fetchFreePlanId(supabase, studentId) {
  const { data, error } = await supabase
    .from('plans')
    .select('id')
    .eq('created_by', studentId)
    .eq('plan_type', 'free')
    .maybeSingle()
  if (error) throw error
  return data?.id || null
}

const LOG_FIELDS =
  'id, logged_date, plan_id, plan_exercise_id, exercise_id, weight_mode, actual_sets, actual_reps, actual_reps_jsonb, actual_weights, actual_weights_jsonb, actual_weight, status, created_at'

/** Registros libres de un día. */
export async function fetchFreeLogs(supabase, { studentId, planId, date }) {
  if (!planId) return []
  const { data, error } = await supabase
    .from('workout_logs')
    .select(LOG_FIELDS)
    .eq('student_id', studentId)
    .eq('plan_id', planId)
    .eq('logged_date', date)
    .order('created_at')
  if (error) throw error
  return data || []
}

/** Último registro hecho de un ejercicio (cualquier plan), para precargar series. */
export async function fetchLastExerciseLog(supabase, { studentId, exerciseId }) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select(LOG_FIELDS)
    .eq('student_id', studentId)
    .eq('exercise_id', exerciseId)
    .eq('status', 'done')
    .order('logged_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Arma los argumentos de save_workout_log para un registro libre.
 * sets: [{ reps, weight }] (strings del form). Filas sin reps se descartan.
 */
export function buildFreeLogArgs({
  studentId,
  planId,
  planExerciseId,
  date,
  today,
  weightMode,
  sets,
  logId = null,
}) {
  const rows = (sets || []).filter((s) => String(s.reps ?? '').trim() !== '')
  const reps = rows.map((s) => Number(s.reps))
  const usesWeights = weightMode !== 'bodyweight'
  const weights = usesWeights
    ? rows.map((s) => (String(s.weight ?? '').trim() === '' ? null : Number(s.weight)))
    : null
  return {
    p_log_id: logId,
    p_student_id: studentId,
    p_plan_id: planId,
    p_plan_exercise_id: planExerciseId,
    p_logged_date: date,
    p_logged_late: date !== today,
    p_weight_mode: weightMode,
    p_reps: reps,
    p_weights: weights,
    p_actual_sets: reps.length,
    p_reps_unit: 'reps',
    p_status: 'done',
    p_completed: true,
  }
}

/**
 * Empieza (o reemplaza) el plan propio de la persona.
 * Mismo orden que el reemplazo de la coach (StudentPlansTab): cerrar el
 * vigente → asignar (clona) → enlazar el sucesor. Solo reemplaza planes
 * que armó la propia persona; si el vigente es de una coach, no lo toca.
 */
export async function startOwnPlan(supabase, { templateId, studentId, now = new Date() }) {
  const today = format(now, 'yyyy-MM-dd')
  const { data: current, error: curErr } = await supabase
    .from('plan_assignments')
    .select('id, plan:plans(created_by)')
    .eq('student_id', studentId)
    .eq('plan_type', 'training')
    .eq('status', 'active')
    .maybeSingle()
  if (curErr) throw curErr
  if (current && current.plan?.created_by !== studentId) {
    const err = new Error('La persona tiene un plan de su coach vigente')
    err.code = 'COACH_PLAN_ACTIVE'
    throw err
  }

  let closed = false
  try {
    if (current) {
      const { error } = await supabase
        .from('plan_assignments')
        .update({ status: 'replaced', closed_at: today })
        .eq('id', current.id)
      if (error) throw error
      closed = true
    }
    const inserted = await assignTemplateToStudent(supabase, {
      templateId,
      studentId,
      startDate: today,
    })
    if (current) {
      await supabase
        .from('plan_assignments')
        .update({ replaced_by_assignment_id: inserted.assignment_id })
        .eq('id', current.id)
    }
    return inserted
  } catch (err) {
    if (closed) {
      await supabase
        .from('plan_assignments')
        .update({ status: 'active', closed_at: null })
        .eq('id', current.id)
    }
    throw err
  }
}
