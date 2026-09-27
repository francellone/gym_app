import { supabase } from '@/lib/supabase'

// ============================================================
// Ciclo de vida de un plan (v47, decisión D4)
// ------------------------------------------------------------
// Un plan con hechos (registros, sesiones, evaluaciones, asignaciones,
// clones) se ARCHIVA; uno sin nada se elimina. Un plan con una asignación
// activa no se archiva: primero se reemplaza o se cierra la asignación desde
// la ficha de la alumna. La base lo garantiza (plan_assignments.plan_id es
// ON DELETE RESTRICT y set_plan_archived rechaza con asignación activa); acá
// solo se decide qué botón mostrar y con qué texto.
// ============================================================

export async function fetchPlanUsage(planId) {
  const { data, error } = await supabase.rpc('plan_usage', { p_plan_id: planId })
  if (error) throw error
  return data || null
}

/** 'blocked' | 'archive' | 'delete' */
export function planLifecycleMode(usage) {
  if (!usage) return null
  if ((usage.active_assignments || 0) > 0) return 'blocked'
  if ((usage.total_refs || 0) > 0) return 'archive'
  return 'delete'
}

/**
 * Qué se conserva al archivar, en palabras. Recibe `t` (useTranslation) y
 * devuelve textos del panel de la coach (coach.planEditor.usage.*).
 */
export function planUsageSummary(u, t) {
  if (!u) return []
  const partes = []
  const n = (k) => u[k] || 0
  const k = (key, count, extra) => t(`coach.planEditor.usage.${key}`, { count, ...extra })
  if (u.is_template) {
    if (n('clones') > 0) {
      partes.push(
        k('clones', n('clones')) +
          (n('clone_students') > 0 ? k('toPeople', n('clone_students')) : '')
      )
    }
    if (n('child_evaluations') > 0) {
      partes.push(k('childEvaluations', n('child_evaluations')))
    }
  } else if (n('students') > 0) {
    partes.push(k('assignments', n('assignments'), { people: k('people', n('students')) }))
  }
  if (n('workout_logs') > 0) {
    partes.push(k('workoutLogs', n('workout_logs')))
  }
  if (n('sessions') > 0) {
    partes.push(k('sessions', n('sessions')))
  }
  const evals = n('eval_results') + n('eval_responses')
  if (evals > 0) {
    partes.push(k('evalResults', evals))
  }
  if (n('prescription_history') > 0) {
    partes.push(k('prescriptionChanges', n('prescription_history')))
  }
  return partes
}

export async function setPlanArchived(planId, archived) {
  const { data, error } = await supabase.rpc('set_plan_archived', {
    p_plan_id: planId,
    p_archived: archived,
  })
  if (error) throw error
  return data
}

export async function deletePlan(planId) {
  // Chequear filas afectadas: si RLS lo bloquea, el DELETE afecta 0 filas SIN error.
  const { data, error } = await supabase.from('plans').delete().eq('id', planId).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    const err = new Error('No se pudo eliminar el plan: no tenés permisos sobre él.')
    err.i18nKey = 'coach.planEditor.deletePlan.noPermission'
    throw err
  }
}
