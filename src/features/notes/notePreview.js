// ============================================================
// notePreview — qué nota se ve primero en cada registro
// ------------------------------------------------------------
// Regla de Franco (2026-10-04), para TODAS las pantallas:
//   se muestra la última nota del OTRO (la coach ve la de la persona,
//   la persona ve la de la coach), porque lo que uno escribió ya lo
//   tiene en la cabeza; lo que le escribieron, no. Si el otro no
//   escribió nada, se muestra la última propia. Siempre se dice de
//   quién es y, si hay más de una, cuántas hay para abrir la
//   conversación completa.
//
// Antes cada pantalla se quedaba con UNA nota por registro (la última
// que llegaba de la base, en orden no determinístico) y la respuesta
// de la coach a una nota de la persona desaparecía.
// ============================================================

// notes: filas de `notes` de un mismo context_id
//   { id, author_role, body, created_at, visibility, deleted_at? }
// viewerRole: 'coach' | 'student'
// Devuelve la conversación ordenada (más vieja primero) con `mine`.
export function buildNoteThread(notes, viewerRole) {
  return (
    (notes || [])
      .filter((n) => !n.deleted_at && String(n.body || '').trim() !== '')
      // La persona nunca ve notas privadas de la coach (la RLS ya las
      // oculta; esto es defensa por si el caller trae de más).
      .filter((n) => viewerRole === 'coach' || n.visibility !== 'coach_private')
      .map((n) => ({
        id: n.id,
        body: String(n.body).trim(),
        authorRole: n.author_role,
        createdAt: n.created_at,
        mine: n.author_role === viewerRole,
      }))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  )
}

// thread: salida de buildNoteThread.
// Devuelve { body, authorRole, mine, total } o null si no hay notas.
export function pickNotePreview(thread) {
  if (!thread || thread.length === 0) return null
  const lastOf = (pred) => {
    for (let i = thread.length - 1; i >= 0; i--) if (pred(thread[i])) return thread[i]
    return null
  }
  const n = lastOf((x) => !x.mine) || lastOf((x) => x.mine)
  return { body: n.body, authorRole: n.authorRole, mine: n.mine, total: thread.length }
}

// Agrupa filas de `notes` por context_id y arma conversación + preview.
// Devuelve Map<context_id, { thread, preview }>.
export function groupNoteThreads(notes, viewerRole) {
  const byCtx = new Map()
  for (const n of notes || []) {
    if (!byCtx.has(n.context_id)) byCtx.set(n.context_id, [])
    byCtx.get(n.context_id).push(n)
  }
  const out = new Map()
  for (const [ctx, arr] of byCtx) {
    const thread = buildNoteThread(arr, viewerRole)
    if (thread.length > 0) out.set(ctx, { thread, preview: pickNotePreview(thread) })
  }
  return out
}

// Le pega a cada fila (log o block log) su conversación:
//   notes        texto de la nota que se muestra primero (compat con
//                las vistas que solo leen un string)
//   notePreview  { body, authorRole, mine, total }
//   noteThread   conversación completa
export function attachNoteThreads(rows, threadsByCtx, { keepLegacy = true } = {}) {
  return (rows || []).map((r) => {
    const t = threadsByCtx?.get(r.id)
    if (t) return { ...r, notes: t.preview.body, notePreview: t.preview, noteThread: t.thread }
    return { ...r, notes: keepLegacy ? (r.notes ?? null) : null, notePreview: null, noteThread: [] }
  })
}
