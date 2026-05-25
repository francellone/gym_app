// ============================================================
// Helpers de clasificación y traducción de errores (handoff 9.1)
// ============================================================
//
// Objetivo: diferenciar errores RECUPERABLES (network, throttle, JWT
// expirado → auto-close 6s OK) de los NO RECUPERABLES (validación
// del back, RLS, CHECK constraints → banner persistente).
//
// Para el alumno, esto evita que un banner rojo se desvanezca antes
// de leerlo cuando hay algo que requiere su acción.
//
// Códigos basados en lo que efectivamente tira el back actual
// (RPC + constraints + RLS instalados durante el proyecto).
// ============================================================

// Códigos de error de Postgres/PostgREST que SIEMPRE requieren acción
// del usuario o intervención del coach. No reintentar automáticamente.
const NON_RECOVERABLE_CODES = new Set([
  '23514', // CHECK constraint violation
  '23503', // foreign key violation
  '23505', // unique constraint violation
  '22023', // invalid_parameter_value
  '02000', // no_data_found
  '42501', // insufficient_privilege (RLS)
  'P0001', // RAISE EXCEPTION custom desde PL/pgSQL
])

// Patrones específicos del back actual. Si el `message` o `details` del
// error matchea alguno, también se clasifica como no recuperable.
const NON_RECOVERABLE_PATTERNS = [
  /workout_logs_/i,
  /profiles_lesiones_/i,
  /sessions_finished_/i,
  /apunta a una plantilla/i,
  /linked_assignment_id/i,
]

/**
 * Devuelve true si el error es transitorio (vale la pena reintentar
 * o que se cierre solo). Devuelve false si requiere acción consciente
 * del usuario (corregir un dato, cambiar de modo, llamar al coach, etc.).
 *
 * @param {Object|Error|null} error - típicamente el `error` de Supabase
 * @returns {boolean}
 */
export function isRecoverableError(error) {
  if (!error) return true
  const code = error.code || error.status
  if (NON_RECOVERABLE_CODES.has(String(code))) return false
  const msg = (error.message || '') + ' ' + (error.details || '')
  if (NON_RECOVERABLE_PATTERNS.some((re) => re.test(msg))) return false
  // Network / timeout / auth / 5xx → tratamos como recuperables
  return true
}

/**
 * Traduce un error técnico del back a un mensaje accionable para el
 * usuario. Si no hay match específico, devuelve el mensaje crudo o
 * un fallback genérico.
 *
 * @param {Object|Error|null} error
 * @returns {string}
 */
export function getFriendlyErrorMessage(error) {
  if (!error) return ''
  const code = String(error.code || error.status || '')
  const msg = error.message || ''
  const details = error.details || ''
  const haystack = `${msg} ${details}`

  // ────────────────────────────────────────────────────────────
  // 23514 — CHECK constraint violation (no recuperable)
  // ────────────────────────────────────────────────────────────
  if (code === '23514') {
    if (/bodyweight_no_weights/i.test(haystack)) {
      return 'Si elegiste "Sin peso", no podés cargar peso. Sacá el peso o cambiá el modo.'
    }
    if (/reps_weights_same_length/i.test(haystack)) {
      return 'La cantidad de reps no coincide con la de pesos. Revisá los sets.'
    }
    if (/workout_logs_weight_mode_check/i.test(haystack)) {
      return 'Modo de peso inválido. Recargá la página.'
    }
    if (/workout_logs_reps_unit_check/i.test(haystack)) {
      return 'Unidad de reps inválida. Recargá la página.'
    }
    if (
      /profiles_lesiones_requires_detail/i.test(haystack) ||
      /profiles_lesiones_/i.test(haystack)
    ) {
      return 'Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.'
    }
    if (
      /sessions_finished_requires_started/i.test(haystack) ||
      /sessions_finished_after_started/i.test(haystack)
    ) {
      return 'Error interno de sesión. Avisá al coach.'
    }
    if (/apunta a una plantilla/i.test(haystack)) {
      return 'Error técnico al asignar el plan. Avisá al coach (cod: 23514 template).'
    }
    // Mensajes en español del RPC save_workout_log (RAISE EXCEPTION USING ERRCODE='check_violation').
    // El RPC NO emite el nombre del constraint en el mensaje, así que los patrones de arriba
    // (que buscan workout_logs_*) no matchean. Sin estos catches, todo error de save_workout_log
    // caía al fallback "Hay un dato que no cumple las reglas".
    if (/p_reps y p_weights|misma longitud/i.test(haystack)) {
      return 'La cantidad de reps no coincide con la de pesos. Revisá los sets.'
    }
    if (/weight_mode inválido/i.test(haystack)) {
      return 'Modo de peso inválido. Recargá la página.'
    }
    if (/reps_unit inválido/i.test(haystack)) {
      return 'Unidad de reps inválida. Recargá la página.'
    }
    if (/bodyweight no admite p_weights|no admite p_weights/i.test(haystack)) {
      return 'Si elegiste "Sin peso", no podés cargar peso. Sacá el peso o cambiá el modo.'
    }
    return 'Hay un dato que no cumple las reglas de la app. Revisá lo cargado y probá de nuevo.'
  }

  // ────────────────────────────────────────────────────────────
  // 23503 — FK violation (no recuperable)
  // ────────────────────────────────────────────────────────────
  if (code === '23503') {
    if (/Plan .* no existe/i.test(haystack))
      return 'El plan no existe o fue eliminado. Recargá la página.'
    if (/Alumno .* no existe/i.test(haystack))
      return 'El alumno no existe o no es válido. Recargá la página.'
    return 'Recurso no encontrado. Recargá la página.'
  }

  // ────────────────────────────────────────────────────────────
  // 23505 — Unique violation (no recuperable)
  // ────────────────────────────────────────────────────────────
  if (code === '23505') {
    return 'Ya existe un registro similar. Archivá el anterior primero.'
  }

  // ────────────────────────────────────────────────────────────
  // 22023 — Invalid parameter
  // ────────────────────────────────────────────────────────────
  if (code === '22023') {
    return 'Faltan datos para guardar. Completá todos los campos.'
  }

  // ────────────────────────────────────────────────────────────
  // 02000 — no_data_found
  // ────────────────────────────────────────────────────────────
  if (code === '02000') {
    return 'El registro que querías editar fue borrado. Recargá la lista.'
  }

  // ────────────────────────────────────────────────────────────
  // 42501 — RLS denied
  // ────────────────────────────────────────────────────────────
  if (code === '42501') {
    return 'No tenés permiso para hacer esto. Avisá al coach.'
  }

  // ────────────────────────────────────────────────────────────
  // P0001 — RAISE EXCEPTION custom: usar mensaje del back tal cual
  // ────────────────────────────────────────────────────────────
  if (code === 'P0001') {
    return msg || 'Operación no permitida.'
  }

  // ────────────────────────────────────────────────────────────
  // Auth / JWT expirado (recuperable, pero requiere acción)
  // ────────────────────────────────────────────────────────────
  if (code === 'PGRST301' || /jwt expired/i.test(haystack)) {
    return 'Tu sesión expiró. Iniciá sesión de nuevo.'
  }

  // ────────────────────────────────────────────────────────────
  // Network / connection (recuperable)
  // ────────────────────────────────────────────────────────────
  if (/network|failed to fetch|networkerror/i.test(haystack)) {
    return 'Sin conexión. Probá de nuevo en un momento.'
  }
  if (code === '429') {
    return 'Demasiadas solicitudes. Esperá unos segundos.'
  }
  if (code === '503' || code === '504') {
    return 'Servidor lento. Reintentá en un momento.'
  }

  // ────────────────────────────────────────────────────────────
  // Fallback: mensaje crudo del back o genérico
  // ────────────────────────────────────────────────────────────
  return msg || 'Algo salió mal. Probá de nuevo o avisá al coach.'
}

/**
 * Helper combinado: convierte un error en `{ message, persistent }`
 * listo para alimentar el estado del banner.
 *
 *   - message: string amigable
 *   - persistent: true si NO debe auto-cerrarse
 *
 * Permite override del mensaje (ej. cuando el contexto del save da
 * más info que el código en sí mismo, como "No pudimos guardar el
 * inicio de la sesión").
 *
 * @param {Object|Error|null} error
 * @param {string} [overrideMessage] - si se pasa, reemplaza el friendly
 * @returns {{ message: string, persistent: boolean }}
 */
export function buildErrorBanner(error, overrideMessage) {
  const persistent = !isRecoverableError(error)
  const message = overrideMessage || getFriendlyErrorMessage(error)
  return { message, persistent }
}
