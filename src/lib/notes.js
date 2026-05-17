// ============================================================
// notes.js — Data layer del Panel de Notas (v24)
// ------------------------------------------------------------
// Fuente única de comunicación coach↔alumno. Encapsula todo el
// acceso a las tablas `note_threads` y `notes`.
//
// Convención: todas las funciones devuelven `{ data, error }` y
// NUNCA tiran (salvo getOrCreateThread con args falsy, que es un
// bug de programador).
//
// El cliente NUNCA toca:
//   - exercise_id, muscle_group, block_type en `notes` (triggers
//     los denormalizan desde el contexto)
//   - last_message_at, unread_for_coach/student, pinned en
//     `note_threads` (triggers los mantienen)
// ============================================================

import { supabase } from './supabase'

// ── Constantes ────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

// ============================================================
// Normalización de errores
// ============================================================
// Devuelve null si no hay error, o un objeto consistente
// { code, message, details, hint, raw }.
function normalizeError(rawError, fallbackMessage = 'Error desconocido') {
  if (!rawError) return null

  const code = rawError.code || rawError.status || 'UNKNOWN'
  const message = rawError.message || fallbackMessage
  const details = rawError.details || null
  const hint = rawError.hint || null

  // Mapeos conocidos (mantenemos el code original también)
  let normalizedCode = String(code)
  let friendlyMessage = message

  if (normalizedCode === '42501') {
    normalizedCode = 'FORBIDDEN'
    friendlyMessage = 'No tenés permiso para esta acción.'
  } else if (normalizedCode === '23514') {
    normalizedCode = 'INVALID_INPUT'
  } else if (normalizedCode === '23503') {
    normalizedCode = 'NOT_FOUND'
  } else if (normalizedCode === '23505') {
    normalizedCode = 'CONFLICT'
  } else {
    // Loggeamos el raw para diagnóstico si es desconocido
    // (no es spam: solo se invoca cuando hay error real).
    if (normalizedCode === 'UNKNOWN') {
      // eslint-disable-next-line no-console
      console.warn('[notes.js] Error sin código mapeado:', rawError)
    }
  }

  return {
    code: normalizedCode,
    message: friendlyMessage,
    details,
    hint,
    raw: rawError,
  }
}

// PGRST116 = `.single()` sin filas. Lo tratamos como `{ data: null, error: null }`
// solo cuando el caller espera 0 ó 1 (typically con maybeSingle ya lo absorbe,
// pero dejamos este guard por si se usa single en algún path).
function isNoRowsError(error) {
  return error && (error.code === 'PGRST116' || /no rows/i.test(error.message || ''))
}

// Defensive: filtros que sean undefined/null/'' no se aplican.
function nonEmpty(v) {
  return v !== undefined && v !== null && v !== ''
}

// ============================================================
// B.1 — getOrCreateThread(coachId, studentId)
// ------------------------------------------------------------
// Solo para coach. Idempotente: el RPC devuelve el thread_id
// existente o crea uno nuevo.
// Devuelve: { data: threadId | null, error }
// ============================================================
export async function getOrCreateThread(coachId, studentId) {
  if (!coachId || !studentId) {
    throw new Error('getOrCreateThread requiere coachId y studentId')
  }
  const { data, error } = await supabase.rpc('notes_get_or_create_thread', {
    p_coach_id: coachId,
    p_student_id: studentId,
  })
  if (error) return { data: null, error: normalizeError(error, 'No se pudo obtener el hilo de notas.') }
  // El RPC devuelve directamente el uuid (o null en casos raros).
  return { data: data ?? null, error: null }
}

// ============================================================
// B.1b — getOrCreateThreadForStudent(studentId)
// ------------------------------------------------------------
// Wrapper que resuelve el coach_id "real" vía la RPC get_coach_id()
// del back en lugar de usar el profile.id del coach logueado.
//
// Motivo: el modelo de la app es admin-único pero la tabla
// `profiles` permite múltiples filas con role='coach'. El backfill
// de v24 metió todas las notas bajo el coach que devuelve
// get_coach_id() (el primero por orden de creación). Si otro
// "coach" se loguea y abre el panel, no debería crear un thread
// paralelo vacío — debería ver el mismo thread del coach principal.
//
// Devuelve: { data: threadId | null, error }
// ============================================================
export async function getOrCreateThreadForStudent(studentId) {
  if (!studentId) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta studentId.', details: null, hint: null, raw: null } }
  }
  const { data: coachId, error: coachErr } = await supabase.rpc('get_coach_id')
  if (coachErr) return { data: null, error: normalizeError(coachErr, 'No se pudo resolver el coach.') }
  if (!coachId)   return { data: null, error: { code: 'NOT_FOUND', message: 'No hay coach configurado.', details: null, hint: null, raw: null } }
  return getOrCreateThread(coachId, studentId)
}

// ============================================================
// B.2 — getStudentThread(studentId)
// ------------------------------------------------------------
// Para el alumno: busca su único thread por student_id.
// Devuelve: { data: thread | null, error }
// ============================================================
export async function getStudentThread(studentId) {
  if (!studentId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('note_threads')
    .select('id, coach_id, student_id, pinned, last_message_at, unread_for_coach, unread_for_student')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error && !isNoRowsError(error)) {
    return { data: null, error: normalizeError(error, 'No se pudo obtener tu hilo de notas.') }
  }
  return { data: data || null, error: null }
}

// ============================================================
// B.3 — listNotes(threadId, filters, pagination)
// ------------------------------------------------------------
// Keyset pagination por (created_at DESC, id DESC).
// Devuelve: { data: Note[], nextCursor, error }
// ============================================================
export async function listNotes(threadId, filters = {}, pagination = {}) {
  if (!threadId) return { data: [], nextCursor: null, error: null }

  const limit = clampLimit(pagination.limit ?? filters.limit ?? DEFAULT_PAGE_SIZE)
  const cursor = pagination.cursor || null
  const signal = pagination.signal // AbortSignal opcional

  let q = supabase
    .from('notes')
    .select('id, thread_id, author_id, author_role, body, visibility, context_type, context_id, exercise_id, muscle_group, block_type, parent_note_id, tags, note_date, read_at_coach, read_at_student, created_at, updated_at, deleted_at')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  // ── Filtros ─────────────────────────────────────────────
  // Defensive: ignoramos undefined/null/'' uniformemente.
  if (nonEmpty(filters.from)) q = q.gte('created_at', filters.from)
  if (nonEmpty(filters.to)) q = q.lte('created_at', filters.to)
  if (nonEmpty(filters.exerciseId)) q = q.eq('exercise_id', filters.exerciseId)
  if (nonEmpty(filters.muscleGroup)) q = q.eq('muscle_group', filters.muscleGroup)
  if (nonEmpty(filters.blockType)) q = q.eq('block_type', filters.blockType)
  if (nonEmpty(filters.contextType)) q = q.eq('context_type', filters.contextType)
  if (nonEmpty(filters.contextId)) q = q.eq('context_id', filters.contextId)
  if (nonEmpty(filters.visibility)) q = q.eq('visibility', filters.visibility)
  if (nonEmpty(filters.authorRole)) q = q.eq('author_role', filters.authorRole)
  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    q = q.overlaps('tags', filters.tags)
  }
  if (nonEmpty(filters.search)) {
    // ilike ya parametriza correctamente. Wildcards en el patrón:
    const escaped = String(filters.search).trim()
    if (escaped) q = q.ilike('body', `%${escaped}%`)
  }

  // ── Keyset pagination ───────────────────────────────────
  if (cursor && cursor.createdAt && cursor.id) {
    // (created_at, id) < (cursor.createdAt, cursor.id)
    // Trasladado a Postgres con OR:
    //   created_at < X OR (created_at = X AND id < Y)
    // Envolvemos los valores en comillas para futuro-proof:
    // PostgREST acepta `"value"` para escapar caracteres reservados
    // (comas, paréntesis) que pueden aparecer si la columna cambia.
    const ts = `"${cursor.createdAt}"`
    const cid = `"${cursor.id}"`
    q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${cid})`)
  }

  // AbortController: si el caller pasó signal y se cancela,
  // PostgREST devolverá un error normal que ignoramos en el hook.
  if (signal) {
    // supabase-js v2 no expone signal directo en select; emulamos
    // con un Promise.race contra el abort.
    const aborted = new Promise((_, reject) => {
      if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
      else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    try {
      const res = await Promise.race([q, aborted])
      return buildListResult(res, limit)
    } catch (err) {
      if (err?.name === 'AbortError') return { data: [], nextCursor: null, error: null, aborted: true }
      return { data: [], nextCursor: null, error: normalizeError(err, 'No se pudieron cargar las notas.') }
    }
  }

  const res = await q
  return buildListResult(res, limit)
}

function buildListResult(res, limit) {
  const { data, error } = res || {}
  if (error) return { data: [], nextCursor: null, error: normalizeError(error, 'No se pudieron cargar las notas.') }
  const rows = data || []
  const nextCursor =
    rows.length === limit && rows.length > 0
      ? { createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
      : null
  return { data: rows, nextCursor, error: null }
}

function clampLimit(n) {
  const v = Number(n) || DEFAULT_PAGE_SIZE
  return Math.min(Math.max(1, v), MAX_PAGE_SIZE)
}

// ============================================================
// B.4 — createNote(payload)
// ------------------------------------------------------------
// Validaciones cliente:
//   - body.trim() no vacío
//   - context_type='free' ⇒ context_id=null
//   - visibility='coach_private' ⇒ author_role='coach'
//
// NO mandar exercise_id, muscle_group, block_type
// (los denormaliza el trigger BEFORE INSERT del back).
// ============================================================
export async function createNote(payload) {
  const {
    threadId,
    body,
    visibility = 'shared',
    contextType = 'free',
    contextId,
    tags = [],
    parentNoteId,
    authorId,
    authorRole,
    muscleGroup, // Fase B++: solo aplica cuando contextType='free'
    noteDate,    // Fase D step 2 (v26b): fecha sobre la que habla la nota
  } = payload || {}

  // ── Validaciones ────────────────────────────────────────
  if (!threadId || !authorId || !authorRole) {
    return {
      data: null,
      error: { code: 'INVALID_INPUT', message: 'Faltan datos obligatorios (threadId, authorId, authorRole).', details: null, hint: null, raw: null },
    }
  }
  const cleanBody = (body || '').trim()
  if (!cleanBody) {
    return {
      data: null,
      error: { code: 'INVALID_INPUT', message: 'La nota no puede estar vacía.', details: null, hint: null, raw: null },
    }
  }
  if (visibility === 'coach_private' && authorRole !== 'coach') {
    return {
      data: null,
      error: { code: 'FORBIDDEN', message: 'Solo el coach puede crear notas privadas.', details: null, hint: null, raw: null },
    }
  }

  // Normalización: free ⇒ context_id NULL (no '')
  const ctxType = contextType || 'free'
  const ctxId = ctxType === 'free' ? null : (contextId || null)

  const insertRow = {
    thread_id: threadId,
    author_id: authorId,
    author_role: authorRole,
    body: cleanBody,
    visibility,
    context_type: ctxType,
    context_id: ctxId,
    parent_note_id: parentNoteId || null,
    tags: Array.isArray(tags) ? tags : [],
  }

  // Fase B++: si el usuario adjunta un "Grupo muscular" manual sin
  // ejercicio (context_type='free'), enviamos muscle_group y el trigger
  // v25c lo respeta. En cualquier otro context_type el trigger pisa
  // este valor con la resolución correspondiente.
  if (ctxType === 'free' && muscleGroup) {
    insertRow.muscle_group = muscleGroup
  }

  // Fase D step 2: si el usuario adjunta una fecha manual en contexto
  // free (la solapa "Día" del composer), enviamos note_date. En otros
  // context_type el trigger lo deriva del log/source.
  if (ctxType === 'free' && noteDate) {
    insertRow.note_date = noteDate
  }

  const { data, error } = await supabase
    .from('notes')
    .insert(insertRow)
    .select()
    .single()

  if (error) return { data: null, error: normalizeError(error, 'No se pudo crear la nota.') }
  return { data, error: null }
}

// ============================================================
// B.5 — replyNote(parentNoteId, payload)
// ------------------------------------------------------------
// SELECT padre y hereda thread_id, context_type, context_id,
// visibility salvo override en payload.
// ============================================================
export async function replyNote(parentNoteId, payload = {}) {
  if (!parentNoteId) {
    return {
      data: null,
      error: { code: 'INVALID_INPUT', message: 'Falta parentNoteId para responder.', details: null, hint: null, raw: null },
    }
  }

  const { data: parent, error: parentError } = await supabase
    .from('notes')
    .select('id, thread_id, context_type, context_id, visibility, deleted_at')
    .eq('id', parentNoteId)
    .maybeSingle()

  if (parentError) return { data: null, error: normalizeError(parentError, 'No se pudo cargar la nota padre.') }
  if (!parent) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'La nota a la que querés responder no existe.', details: null, hint: null, raw: null },
    }
  }
  if (parent.deleted_at) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'No se puede responder a una nota eliminada.', details: null, hint: null, raw: null },
    }
  }

  return createNote({
    threadId: parent.thread_id,
    body: payload.body,
    visibility: payload.visibility ?? parent.visibility,
    contextType: payload.contextType ?? parent.context_type,
    contextId: payload.contextId ?? parent.context_id,
    tags: payload.tags ?? [],
    parentNoteId,
    authorId: payload.authorId,
    authorRole: payload.authorRole,
  })
}

// ============================================================
// B.6 — markThreadRead(threadId, asRole)
// ------------------------------------------------------------
// Usa la RPC notes_mark_thread_read (v24f) que bypasea RLS con
// SECURITY DEFINER y valida permisos explícitamente. Necesario
// porque la policy "Student update own notes" no permite al alumno
// actualizar notas del coach (correcto: el alumno no debería poder
// editar bodies del coach), pero sí necesita poder marcarlas como
// leídas.
// Devuelve: { data: { marked }, error }
// ============================================================
export async function markThreadRead(threadId, asRole) {
  if (!threadId || !asRole) {
    return { data: { marked: 0 }, error: null }
  }
  const { data, error } = await supabase.rpc('notes_mark_thread_read', {
    p_thread_id: threadId,
    p_as_role:   asRole,
  })
  if (error) return { data: { marked: 0 }, error: normalizeError(error, 'No se pudo marcar como leído.') }
  return { data: { marked: typeof data === 'number' ? data : 0 }, error: null }
}

// ============================================================
// B.6b — updateNote(noteId, { body })
// ------------------------------------------------------------
// Actualiza el body de una nota existente. RLS permite:
//   - Coach: cualquier nota (policy 'Coach update notes')
//   - Alumno: solo sus propias (policy 'Student update own notes')
// El campo updated_at se setea automáticamente por trigger.
// Devuelve: { data: nota actualizada | null, error }
// ============================================================
export async function updateNote(noteId, payload = {}) {
  if (!noteId) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta noteId.', details: null, hint: null, raw: null } }
  }
  const cleanBody = (payload.body || '').trim()
  if (!cleanBody) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'La nota no puede estar vacía.', details: null, hint: null, raw: null } }
  }
  const { data, error } = await supabase
    .from('notes')
    .update({ body: cleanBody })
    .eq('id', noteId)
    .select()
    .maybeSingle()
  if (error) return { data: null, error: normalizeError(error, 'No se pudo actualizar la nota.') }
  return { data: data || null, error: null }
}

// ============================================================
// B.6c — editNote(note, { body })
// ------------------------------------------------------------
// API unificada que decide automáticamente si:
//   - Es una nota panel-authored (context_type free / exercise):
//     UPDATE directo en `notes` (vía updateNote).
//   - Es una nota mirror desde una fuente legacy
//     (context_type workout_log / workout_block_log): UPDATE en la
//     tabla fuente, y el trigger v25e re-sincroniza el mirror.
//   - Cualquier otro context_type: read-only, devuelve INVALID_INPUT.
//
// Esto le permite al alumno editar sus comentarios "viejos" de
// TodayWorkoutPage directamente desde el panel.
// ============================================================
export async function editNote(note, payload = {}) {
  if (!note?.id) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta nota.', details: null, hint: null, raw: null } }
  }
  const cleanBody = (payload.body || '').trim()
  if (!cleanBody) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'La nota no puede estar vacía.', details: null, hint: null, raw: null } }
  }

  // Round 2b: UPDATE directo de notes para todos los context_types.
  // El routing previo (rutear a columnas legacy) ya no aplica porque
  // las columnas se dropean en v26d. Si llega un context que no
  // soportamos editar desde panel (plan, session_day), devolvemos
  // NOT_SUPPORTED.
  if (
    note.context_type === 'free' ||
    note.context_type === 'exercise' ||
    note.context_type === 'workout_log' ||
    note.context_type === 'workout_block_log' ||
    note.context_type === 'evaluation_test'
  ) {
    return updateNote(note.id, { body: cleanBody })
  }

  return {
    data: null,
    error: {
      code: 'NOT_SUPPORTED',
      message: 'Este tipo de nota no se puede editar desde el panel.',
      details: null, hint: null, raw: null,
    },
  }
}

// ============================================================
// B.6d — deleteNote(note)
// ------------------------------------------------------------
// Análogo a editNote: rutea por context_type.
//   - workout_log / workout_block_log: SET notes = NULL en la fuente
//     legacy; el trigger v25e soft-deletea el mirror.
//   - free / exercise: softDeleteNote directo.
//   - resto: read-only.
// ============================================================
export async function deleteNote(note) {
  if (!note?.id) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta nota.', details: null, hint: null, raw: null } }
  }

  // Round 2b: soft-delete directo en notes para todos los context_types.
  if (
    note.context_type === 'free' ||
    note.context_type === 'exercise' ||
    note.context_type === 'workout_log' ||
    note.context_type === 'workout_block_log' ||
    note.context_type === 'evaluation_test'
  ) {
    return softDeleteNote(note.id)
  }

  return {
    data: null,
    error: {
      code: 'NOT_SUPPORTED',
      message: 'Este tipo de nota no se puede borrar desde el panel.',
      details: null, hint: null, raw: null,
    },
  }
}

// ============================================================
// B.7 — softDeleteNote(noteId)
// ------------------------------------------------------------
// Soft-delete: no hay DELETE policy en RLS.
// ============================================================
export async function softDeleteNote(noteId) {
  if (!noteId) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta noteId.', details: null, hint: null, raw: null } }
  }
  const { data, error } = await supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id, thread_id, deleted_at')
    .maybeSingle()

  if (error) return { data: null, error: normalizeError(error, 'No se pudo eliminar la nota.') }
  return { data: data || null, error: null }
}

// ============================================================
// B.8 — subscribeThread(threadId, onChange)
// ------------------------------------------------------------
// 1 canal por thread. Devuelve función de cleanup que llama
// removeChannel. El callback recibe `{ event, new, old }`
// donde event ∈ INSERT|UPDATE|DELETE.
//
// IMPORTANTE: el caller debe ignorar items con deleted_at != null
// (tratarlos como remove). Acá solo reenviamos los payloads
// tal como llegan, para no esconder UPDATEs intermedios.
// ============================================================
export function subscribeThread(threadId, onChange) {
  if (!threadId || typeof onChange !== 'function') {
    const noop = () => {}
    noop.getState = () => null
    return noop
  }
  const channel = supabase
    .channel(`notes:thread:${threadId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        try {
          onChange({
            event: payload.eventType,
            new: payload.new || null,
            old: payload.old || null,
          })
        } catch (err) {
          // No tirar dentro del callback de realtime
          // eslint-disable-next-line no-console
          console.error('[notes.subscribeThread] onChange error:', err)
        }
      },
    )
    .subscribe()

  const cleanup = () => {
    try {
      supabase.removeChannel(channel)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[notes.subscribeThread] removeChannel error:', err)
    }
  }
  // El consumidor (useNotes) puede chequear estado para decidir
  // re-suscripción tras visibilitychange / disconnect.
  cleanup.getState = () => {
    try { return channel.state || null } catch { return null }
  }
  return cleanup
}

// ============================================================
// B.9 — listFilterOptions(threadId)
// ------------------------------------------------------------
// Devuelve las opciones de filtros del panel derivadas de las
// PROPIAS notas del thread (no del catálogo completo). Garantiza
// que solo aparezcan valores que efectivamente devolverán filas.
//
// Una sola RPC: notes_thread_filter_options (v24d). SECURITY DEFINER
// bypasea RLS de exercises (el thread_id ya filtra qué se ve).
//
// Devuelve: { data: { exercises, muscle_groups, block_types, tags }, error }
//   - exercises:    Array<{ id, name, muscle_group }>
//   - muscle_groups: string[]
//   - block_types:  Array<'strength'|'aerobic'|'circuit'>
//   - tags:         string[]
// ============================================================
const EMPTY_OPTS = { exercises: [], muscle_groups: [], block_types: [], tags: [] }

export async function listFilterOptions(threadId) {
  if (!threadId) return { data: EMPTY_OPTS, error: null }
  const { data, error } = await supabase.rpc('notes_thread_filter_options', {
    p_thread_id: threadId,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes.listFilterOptions] error:', error)
    return { data: EMPTY_OPTS, error: normalizeError(error, 'No se pudieron cargar los filtros.') }
  }
  // La RPC devuelve jsonb; supabase-js lo deserializa a objeto JS.
  return {
    data: {
      exercises:     Array.isArray(data?.exercises)     ? data.exercises     : [],
      muscle_groups: Array.isArray(data?.muscle_groups) ? data.muscle_groups : [],
      block_types:   Array.isArray(data?.block_types)   ? data.block_types   : [],
      tags:          Array.isArray(data?.tags)          ? data.tags          : [],
    },
    error: null,
  }
}

// ============================================================
// B.6e — postPSEDayNote({ studentId, sessionLoggedDate, dayLabel, body })
// ------------------------------------------------------------
// Helper específico para el modal PSE diario de TodayWorkoutPage.
// Toma la observación que el alumno escribe al cerrar el día y la
// publica como nota libre en el panel con context_type='free' +
// note_date = la fecha de la sesión, con un prefijo "[Día X]" para
// indicar qué sección/día del plan corresponde.
//
// Antes (legacy): la nota se guardaba como key dentro de
// workout_sessions.borg_per_day jsonb. Quedaba enterrada sin que
// ningún UI la leyera. Esta función reemplaza ese flujo.
//
// Devuelve: { data: nota | null, error }
// ============================================================
export async function postPSEDayNote({ studentId, sessionLoggedDate, dayLabel, body }) {
  if (!studentId) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta studentId.', details: null, hint: null, raw: null } }
  }
  const clean = (body || '').trim()
  if (!clean) return { data: null, error: null } // sin contenido no hace nada (no-op)

  const { data: thread, error: threadErr } = await getStudentThread(studentId)
  if (threadErr) return { data: null, error: threadErr }
  if (!thread) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'No hay hilo de notas inicializado para este alumno.', details: null, hint: null, raw: null } }
  }

  const prefixedBody = dayLabel ? `[${dayLabel}] ${clean}` : clean

  return createNote({
    threadId: thread.id,
    body: prefixedBody,
    visibility: 'shared',
    contextType: 'free',
    contextId: null,
    noteDate: sessionLoggedDate || null,
    authorId: studentId,
    authorRole: 'student',
  })
}

// ============================================================
// B.6g — postWorkoutLogNote({ studentId, logId, body })
// ------------------------------------------------------------
// Upsert directo al panel. Reemplaza al trigger fn_sync_workout_log_to_notes
// que en round 2b se elimina junto con la columna workout_logs.notes.
//
// Lógica:
//   - Si existe mirror vivo para (student, log): UPDATE body.
//   - Si no existe: INSERT nuevo.
//   - Si body vacío y existe mirror: soft-delete.
//   - Si body vacío y no existe: no-op.
//
// Devuelve { data, error } donde data es la nota afectada (puede ser
// null si fue soft-delete o no-op).
// ============================================================
export async function postWorkoutLogNote({ studentId, logId, body }) {
  if (!studentId || !logId) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Falta studentId o logId.', details: null, hint: null, raw: null } }
  }
  const cleanBody = (body || '').trim()

  // Buscar mirror existente del log para este alumno
  const { data: existing, error: findErr } = await supabase
    .from('notes')
    .select('id, body, thread_id')
    .eq('context_type', 'workout_log')
    .eq('context_id', logId)
    .eq('author_role', 'student')
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr && !isNoRowsError(findErr)) {
    return { data: null, error: normalizeError(findErr, 'No se pudo buscar la nota del log.') }
  }

  // Caso 1: body vacío → soft-delete si existe
  if (!cleanBody) {
    if (!existing) return { data: null, error: null } // no-op
    return softDeleteNote(existing.id)
  }

  // Caso 2: existe → UPDATE body si cambió
  if (existing) {
    if (existing.body === cleanBody) return { data: existing, error: null } // no-op
    return updateNote(existing.id, { body: cleanBody })
  }

  // Caso 3: no existe → INSERT. Resolvemos el thread del alumno.
  const { data: thread, error: threadErr } = await getStudentThread(studentId)
  if (threadErr) return { data: null, error: threadErr }
  if (!thread) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'No hay hilo de notas inicializado para este alumno.', details: null, hint: null, raw: null } }
  }

  return createNote({
    threadId: thread.id,
    body: cleanBody,
    visibility: 'shared',
    contextType: 'workout_log',
    contextId: logId,
    authorId: studentId,
    authorRole: 'student',
  })
}

// ============================================================
// B.6h — postEvalCommentNote({ studentId, responseId, body, role, visibility })
// ------------------------------------------------------------
// Análogo a postWorkoutLogNote pero para mirrors de evaluation_test.
// Args:
//   studentId    uuid del alumno (autor si role='student')
//   responseId   uuid de evaluation_test_responses (context_id)
//   body         text — body limpio o vacío para borrar
//   role         'student' | 'coach' — autor de la nota
//   visibility   'shared' | 'coach_private' — solo aplica si role='coach'
//
// Para role='coach' usamos public.get_coach_id() como author_id.
// ============================================================
export async function postEvalCommentNote({ studentId, responseId, body, role, visibility }) {
  if (!studentId || !responseId || !role) {
    return { data: null, error: { code: 'INVALID_INPUT', message: 'Faltan args obligatorios (studentId, responseId, role).', details: null, hint: null, raw: null } }
  }
  const cleanBody = (body || '').trim()
  const effectiveVisibility = role === 'student'
    ? 'shared'
    : (visibility === 'coach_private' ? 'coach_private' : 'shared')

  // Buscar mirror existente con el matching exacto (response_id, role, visibility)
  const { data: existing, error: findErr } = await supabase
    .from('notes')
    .select('id, body, thread_id, author_id')
    .eq('context_type', 'evaluation_test')
    .eq('context_id', responseId)
    .eq('author_role', role)
    .eq('visibility', effectiveVisibility)
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr && !isNoRowsError(findErr)) {
    return { data: null, error: normalizeError(findErr, 'No se pudo buscar la nota eval.') }
  }

  if (!cleanBody) {
    if (!existing) return { data: null, error: null }
    return softDeleteNote(existing.id)
  }

  if (existing) {
    if (existing.body === cleanBody) return { data: existing, error: null }
    return updateNote(existing.id, { body: cleanBody })
  }

  // Insert nuevo
  const { data: thread, error: threadErr } = await getStudentThread(studentId)
  if (threadErr) return { data: null, error: threadErr }
  if (!thread) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'No hay hilo de notas inicializado para este alumno.', details: null, hint: null, raw: null } }
  }

  // Para coach, necesitamos su id. Lo resolvemos via RPC get_coach_id.
  let authorId = studentId
  if (role === 'coach') {
    const { data: coachId } = await supabase.rpc('get_coach_id')
    if (!coachId) {
      return { data: null, error: { code: 'NOT_FOUND', message: 'No hay coach configurado.', details: null, hint: null, raw: null } }
    }
    authorId = coachId
  }

  return createNote({
    threadId: thread.id,
    body: cleanBody,
    visibility: effectiveVisibility,
    contextType: 'evaluation_test',
    contextId: responseId,
    authorId,
    authorRole: role,
  })
}

// ============================================================
// B.6f — fetchMirrorNotes({ contextType, contextIds })
// ------------------------------------------------------------
// Helper batch para que las pantallas legacy puedan leer el body
// de las notas mirror sin pegarle a las columnas viejas que vamos
// a dropear en round 2b.
//
// Caso de uso: una pantalla muestra una lista de workout_logs y
// quiere mostrar `notes` al lado. Antes leía `workout_logs.notes`.
// Ahora hace UNA query batch a `notes` filtrando por context_type
// + context_ids y construye un Map<context_id, body>.
//
// Para evaluation_test (3 mirrors por response: student, coach_pub,
// coach_priv), la función devuelve todas las filas y el caller
// hace el grouping según author_role + visibility.
//
// RLS: filtra automáticamente — alumno ve solo shared de su thread,
// coach ve todo. No necesitamos pasar thread_id explícito.
//
// Devuelve:
//   { data: Array<{id, context_id, author_role, visibility, body, created_at, updated_at}>, error }
// ============================================================
export async function fetchMirrorNotes({ contextType, contextIds }) {
  if (!contextType || !Array.isArray(contextIds) || contextIds.length === 0) {
    return { data: [], error: null }
  }
  const { data, error } = await supabase
    .from('notes')
    .select('id, context_id, author_role, visibility, body, created_at, updated_at')
    .eq('context_type', contextType)
    .in('context_id', contextIds)
    .is('deleted_at', null)
  if (error) {
    return { data: [], error: normalizeError(error, 'No se pudieron cargar las notas.') }
  }
  return { data: data || [], error: null }
}

// Helper de conveniencia: workout_logs/workout_block_logs/plan_exercise
// son 1 nota por context_id (siempre author='student' y visibility='shared').
// Devuelve Map<context_id, body>.
export async function fetchSingleMirrorBodies({ contextType, contextIds }) {
  const { data } = await fetchMirrorNotes({ contextType, contextIds })
  const map = new Map()
  for (const n of data) {
    map.set(n.context_id, n.body)
  }
  return map
}

// Helper de conveniencia para evaluation_test: hasta 3 mirrors por
// response (student_comment, coach_comment_public, coach_comment_private).
// Devuelve Map<response_id, { studentComment, coachPublic, coachPrivate }>.
export async function fetchEvalMirrorBodies(responseIds) {
  const { data } = await fetchMirrorNotes({ contextType: 'evaluation_test', contextIds: responseIds })
  const map = new Map()
  for (const n of data) {
    if (!map.has(n.context_id)) {
      map.set(n.context_id, { studentComment: null, coachPublic: null, coachPrivate: null })
    }
    const slot = map.get(n.context_id)
    if (n.author_role === 'student' && n.visibility === 'shared') slot.studentComment = n.body
    else if (n.author_role === 'coach' && n.visibility === 'shared') slot.coachPublic = n.body
    else if (n.author_role === 'coach' && n.visibility === 'coach_private') slot.coachPrivate = n.body
  }
  return map
}

// ============================================================
// B.11 — listAllActiveExercises()
// ------------------------------------------------------------
// Catálogo completo de ejercicios activos. Lo necesita el composer
// para que el coach/alumno pueda elegir cualquier ejercicio al
// que adjuntar la nota (no solo los ya comentados en el thread,
// que es lo que devuelve listFilterOptions).
//
// Cache módulo (5 min) — el catálogo rara vez cambia.
// Devuelve: { data: Array<{id, name, muscle_group}>, error }
// ============================================================
let _catalogCache = null
const CATALOG_CACHE_TTL_MS = 5 * 60_000

export async function listAllActiveExercises() {
  if (_catalogCache && _catalogCache.expiresAt > Date.now()) {
    return { data: _catalogCache.value, error: null }
  }
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[notes.listAllActiveExercises] error:', error)
    return { data: [], error: normalizeError(error, 'No se pudo cargar el catálogo.') }
  }
  _catalogCache = { value: data || [], expiresAt: Date.now() + CATALOG_CACHE_TTL_MS }
  return { data: data || [], error: null }
}

// ============================================================
// Helpers extra (no en spec pero útiles para los componentes)
// ============================================================

// Etiqueta legible para context_type.
const CONTEXT_TYPE_LABELS = {
  free: 'Libre',
  workout_log: 'Registro',
  workout_block_log: 'Bloque registrado',
  plan_exercise: 'Ejercicio (plan)',
  exercise: 'Ejercicio',
  evaluation_test: 'Evaluación',
  plan: 'Plan',
  session_day: 'Sesión',
}

export function contextTypeLabel(type) {
  return CONTEXT_TYPE_LABELS[type] || type || ''
}
