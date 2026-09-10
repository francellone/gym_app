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

/** Qué se conserva al archivar, en palabras. */
export function planUsageSummary(u) {
  if (!u) return []
  const partes = []
  const n = (k) => u[k] || 0
  if (u.is_template) {
    if (n('clones') > 0) {
      partes.push(
        `${n('clones')} ${n('clones') === 1 ? 'copia asignada' : 'copias asignadas'}` +
          (n('clone_students') > 0
            ? ` a ${n('clone_students')} ${n('clone_students') === 1 ? 'persona' : 'personas'}`
            : '')
      )
    }
    if (n('child_evaluations') > 0) {
      partes.push(
        `${n('child_evaluations')} ${n('child_evaluations') === 1 ? 'evaluación vinculada' : 'evaluaciones vinculadas'}`
      )
    }
  } else if (n('students') > 0) {
    partes.push(
      `${n('assignments')} ${n('assignments') === 1 ? 'asignación' : 'asignaciones'} (${n('students')} ${n('students') === 1 ? 'persona' : 'personas'})`
    )
  }
  if (n('workout_logs') > 0) {
    partes.push(
      `${n('workout_logs')} ${n('workout_logs') === 1 ? 'entrenamiento registrado' : 'entrenamientos registrados'}`
    )
  }
  if (n('sessions') > 0) {
    partes.push(`${n('sessions')} ${n('sessions') === 1 ? 'sesión' : 'sesiones'}`)
  }
  const evals = n('eval_results') + n('eval_responses')
  if (evals > 0) {
    partes.push(`${evals} ${evals === 1 ? 'resultado de evaluación' : 'resultados de evaluación'}`)
  }
  if (n('prescription_history') > 0) {
    partes.push(
      `${n('prescription_history')} ${n('prescription_history') === 1 ? 'cambio de prescripción' : 'cambios de prescripción'}`
    )
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
    throw new Error('No se pudo eliminar el plan: no tenés permisos sobre él.')
  }
}
