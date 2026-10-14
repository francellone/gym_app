// ============================================================
// Borrador local de un formulario (2026-10-14)
// ------------------------------------------------------------
// Antes nada se guardaba solo: si el celular recargaba la página a mitad del
// formulario (pasa seguido en iPhone al cambiar de app), se perdía todo. Y el
// botón "Guardar borrador" guardaba en la base pero al volver a abrir el
// formulario las respuestas no se cargaban.
//
// Ahora cada respuesta se guarda en el dispositivo (localStorage) bajo una
// clave por asignación, y además se manda a la base al pasar de página. Al
// abrir, gana lo más completo entre lo local y lo de la base.
// Todo con try/catch: en modo privado o sin almacenamiento, el formulario
// funciona igual, solo que sin el respaldo local.
// ============================================================

const PREFIX = 'gymcoach_form_draft_'

export function draftKey(assignmentId) {
  return assignmentId ? `${PREFIX}${assignmentId}` : null
}

export function readLocalDraft(assignmentId) {
  const key = draftKey(assignmentId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.responses === 'object' && parsed.responses
      ? parsed.responses
      : null
  } catch {
    return null
  }
}

export function writeLocalDraft(assignmentId, responses) {
  const key = draftKey(assignmentId)
  if (!key) return
  try {
    if (!responses || Object.keys(responses).length === 0) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify({ responses, savedAt: Date.now() }))
  } catch {
    /* sin almacenamiento: seguimos sin respaldo local */
  }
}

export function clearLocalDraft(assignmentId) {
  const key = draftKey(assignmentId)
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
}

const answered = (r) =>
  Object.values(r || {}).filter(
    (v) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)
  ).length

/**
 * Respuestas con las que arranca el formulario: la versión con más
 * respuestas cargadas entre la del dispositivo y la de la base (si empatan,
 * la del dispositivo, que se guarda en cada cambio y suele ser la última).
 */
export function pickInitialResponses(localResponses, serverResponses) {
  const local = localResponses || {}
  const server = serverResponses || {}
  return answered(server) > answered(local) ? server : local
}
