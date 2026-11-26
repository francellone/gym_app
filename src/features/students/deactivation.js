// ============================================================
// Desactivar / reactivar una persona y su plan vigente (2026-11-26)
// ------------------------------------------------------------
// Decisión de Franco: al desactivar a alguien, sus asignaciones
// vigentes (training y evaluación) se PAUSAN con un motivo fijo.
// No se pierde nada y dejan de figurar como vigentes (antes el
// calendario mostraba "Fin de plan · —" de personas inactivas).
// Al reactivar, la coach elige si reanuda lo que se pausó por eso.
//
// El motivo se guarda en español a propósito (es dato, como el
// historial) y sirve para reconocer qué pausó la desactivación y
// qué pausó la coach a mano (eso no se reanuda solo).
//
// Pausar o reanudar no notifica: los triggers de aviso de
// plan_assignments solo miran fechas, días y tipo de plan.
// ============================================================

export const DEACTIVATION_PAUSE_REASON = 'Persona desactivada'

// Pausa todas las asignaciones 'active' de la persona.
// Devuelve las filas pausadas ([{ id, plan_type }]).
export async function pauseAssignmentsOnDeactivate(supabase, studentId) {
  const { data, error } = await supabase
    .from('plan_assignments')
    .update({ status: 'paused', status_reason: DEACTIVATION_PAUSE_REASON })
    .eq('student_id', studentId)
    .eq('status', 'active')
    .select('id, plan_type')
  if (error) throw error
  return data || []
}

// Lo que se puede reanudar al reactivar: lo pausado por la
// desactivación, salvo que mientras tanto haya otra asignación
// activa del mismo tipo (no dejar dos planes vigentes).
export async function fetchResumableAssignments(supabase, studentId) {
  const { data, error } = await supabase
    .from('plan_assignments')
    .select('id, plan_type, status, status_reason, plan:plans!plan_id(title)')
    .eq('student_id', studentId)
    .in('status', ['active', 'paused'])
  if (error) throw error
  return pickResumable(data || [])
}

export function pickResumable(rows) {
  const activeTypes = new Set(
    rows.filter((r) => r.status === 'active').map((r) => r.plan_type || 'training')
  )
  const seen = new Set()
  const out = []
  for (const r of rows) {
    if (r.status !== 'paused' || r.status_reason !== DEACTIVATION_PAUSE_REASON) continue
    const type = r.plan_type || 'training'
    // Una por tipo como mucho, y nunca encima de una activa.
    if (activeTypes.has(type) || seen.has(type)) continue
    seen.add(type)
    out.push(r)
  }
  return out
}

export async function resumeAssignments(supabase, ids) {
  if (!ids || ids.length === 0) return
  const { error } = await supabase
    .from('plan_assignments')
    .update({ status: 'active', status_reason: null })
    .in('id', ids)
    .eq('status', 'paused')
  if (error) throw error
}

// Títulos para el confirm ("Plan 2 — Ari" → "Plan 2").
export function resumableTitles(rows) {
  return rows
    .map((r) =>
      String(r.plan?.title || '')
        .split(' — ')[0]
        .trim()
    )
    .filter(Boolean)
    .join(', ')
}

// Lo que corre DESPUÉS de guardar profiles.active (lista de Personas y
// ficha usan lo mismo). confirmResume(titles) → boolean: la UI pregunta.
export async function syncAssignmentsWithActive(supabase, { studentId, newActive, confirmResume }) {
  if (!newActive) {
    await pauseAssignmentsOnDeactivate(supabase, studentId)
    return
  }
  const resumable = await fetchResumableAssignments(supabase, studentId)
  if (resumable.length === 0) return
  if (!confirmResume(resumableTitles(resumable))) return
  await resumeAssignments(
    supabase,
    resumable.map((r) => r.id)
  )
}
