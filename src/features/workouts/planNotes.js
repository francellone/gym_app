// ============================================================
// planNotes.js — notas guardadas desde el Chat que se ven en Entrenar (v75)
// ------------------------------------------------------------
// Desde un mensaje del chat la coach puede guardar copias:
//   - context_type='exercise'       → el ejercicio en todos los planes
//   - context_type='plan_exercise'  → ese ejercicio solo en ESE plan
//   - context_type='plan'           → arriba de un día del plan (plan_section)
// Las copias de un mismo mensaje tienen el mismo source_note_id. En la
// tarjeta del ejercicio el texto se muestra UNA sola vez (pedido de Franco).
// ============================================================

/**
 * Notas con ejercicio que corresponden al plan que se está entrenando.
 * - descarta las de día (context 'plan'): van aparte;
 * - descarta las de otro plan (context 'plan_exercise' con otro plan_id);
 * - deja una sola copia por mensaje y ejercicio (prefiere la del plan).
 */
export function notesForPlan(notes = [], { planId } = {}) {
  const out = []
  const seen = new Map() // `${source}|${exercise}` → índice en out
  for (const n of notes) {
    if (!n || n.deleted_at) continue
    if (n.context_type === 'plan') continue
    if (!n.exercise_id) continue
    if (n.context_type === 'plan_exercise' && planId && n.plan_id && n.plan_id !== planId) continue
    if (n.source_note_id) {
      const key = `${n.source_note_id}|${n.exercise_id}`
      const idx = seen.get(key)
      if (idx !== undefined) {
        if (n.context_type === 'plan_exercise' && out[idx].context_type !== 'plan_exercise') {
          out[idx] = n
        }
        continue
      }
      seen.set(key, out.length)
    }
    out.push(n)
  }
  return out
}

/** Notas de la coach para un día del plan, la más nueva primero. */
export function dayNotesFor(notes = [], { planId, section } = {}) {
  if (!planId || !section) return []
  return notes
    .filter(
      (n) =>
        n &&
        !n.deleted_at &&
        n.context_type === 'plan' &&
        n.plan_id === planId &&
        n.plan_section === section &&
        n.visibility === 'shared'
    )
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
}
