// ============================================================
// guidedFlow.js — "bloque guiado" en Entrenar (pedido de Franco 2026-10-15)
// ------------------------------------------------------------
// Al resolver un ejercicio (hecho u omitido) su tarjeta se pliega y se abre
// el SIGUIENTE pendiente que esté más abajo. Si no queda ninguno abajo, no
// se mueve nada (respeta a quien registra fuera de orden). Cuando el bloque
// queda todo resuelto, se pliega y se abre el bloque siguiente del día.
//
// Solo reacciona a una acción de la persona sobre algo que NO estaba
// resuelto: corregir un ejercicio ya hecho no mueve la pantalla.
// ============================================================

/** Primer id pendiente DESPUÉS de currentId en orderedIds (null si no hay). */
export function nextPendingAfter(orderedIds, resolvedIds, currentId) {
  const ids = orderedIds || []
  const done = resolvedIds instanceof Set ? resolvedIds : new Set(resolvedIds || [])
  const idx = ids.indexOf(currentId)
  if (idx < 0) return null
  for (let i = idx + 1; i < ids.length; i++) {
    if (!done.has(ids[i])) return ids[i]
  }
  return null
}

/** true si todos los ids están resueltos (y hay al menos uno). */
export function allResolved(orderedIds, resolvedIds) {
  const ids = orderedIds || []
  const done = resolvedIds instanceof Set ? resolvedIds : new Set(resolvedIds || [])
  return ids.length > 0 && ids.every((id) => done.has(id))
}

/** Primer id pendiente desde el principio (para abrir un bloque recién llegado). */
export function firstPending(orderedIds, resolvedIds) {
  const ids = orderedIds || []
  const done = resolvedIds instanceof Set ? resolvedIds : new Set(resolvedIds || [])
  return ids.find((id) => !done.has(id)) ?? null
}

// ── Pedido "abrí este bloque" (bloque completo → el siguiente) ──────────
// Las run cards no comparten estado: un evento de ventana las une, igual
// que milestones/editRequest.js.
export const OPEN_BLOCK_EVENT = 'gym:open-block'

export function requestBlockOpen(blockId) {
  if (!blockId || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_BLOCK_EVENT, { detail: { blockId } }))
}

export function onBlockOpenRequest(handler) {
  if (typeof window === 'undefined') return () => {}
  const fn = (e) => handler(e?.detail?.blockId)
  window.addEventListener(OPEN_BLOCK_EVENT, fn)
  return () => window.removeEventListener(OPEN_BLOCK_EVENT, fn)
}

/** Lleva un elemento al tope de la vista después de que el plegado se acomode. */
export function scrollIntoViewSoon(getEl, delay = 120) {
  if (typeof window === 'undefined') return
  setTimeout(() => {
    const el = typeof getEl === 'function' ? getEl() : getEl
    if (!el || typeof el.scrollIntoView !== 'function') return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, delay)
}
