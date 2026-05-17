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
const TAGS_CACHE_TTL_MS = 60_000

// Caches de módulo
const _tagsCache = new Map() // threadId → { value, expiresAt }
let _exercisesCache = null   // { value, expiresAt }
const EXERCISES_CACHE_TTL_MS = 60_000 * 5

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
    .select('id, thread_id, author_id, author_role, body, visibility, context_type, context_id, exercise_id, muscle_group, block_type, parent_note_id, tags, read_at_coach, read_at_student, created_at, updated_at, deleted_at')
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

  const { data, error } = await supabase
    .from('notes')
    .insert(insertRow)
    .select()
    .single()

  if (error) return { data: null, error: normalizeError(error, 'No se pudo crear la nota.') }
  // Invalida cache de tags del thread (puede haber tags nuevos)
  _tagsCache.delete(threadId)
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
// Marca como leídas las notas del OTRO rol que aún no fueron
// leídas. Para el alumno limita a visibility='shared' (red de
// seguridad además de RLS).
// Devuelve: { data: { marked }, error }
// ============================================================
export async function markThreadRead(threadId, asRole) {
  if (!threadId || !asRole) {
    return { data: { marked: 0 }, error: null }
  }
  const otherRole = asRole === 'coach' ? 'student' : 'coach'
  const readField = asRole === 'coach' ? 'read_at_coach' : 'read_at_student'
  const nowIso = new Date().toISOString()

  let q = supabase
    .from('notes')
    .update({ [readField]: nowIso })
    .eq('thread_id', threadId)
    .eq('author_role', otherRole)
    .is(readField, null)
    .is('deleted_at', null)

  if (asRole === 'student') {
    q = q.eq('visibility', 'shared')
  }

  // En UPDATE…select(), `count` viene null en supabase-js v2. Usamos data.length
  // como única fuente de verdad (RLS filtra lo que no podemos tocar).
  const { data, error } = await q.select('id')
  if (error) return { data: { marked: 0 }, error: normalizeError(error, 'No se pudo marcar como leído.') }
  return { data: { marked: data?.length ?? 0 }, error: null }
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
    .select('id, thread_id, tags, deleted_at')
    .maybeSingle()

  if (error) return { data: null, error: normalizeError(error, 'No se pudo eliminar la nota.') }
  // Si la nota tenía tags, invalidamos la cache del thread para no devolver
  // tags fantasma. Si no hay thread_id (no debería) cae al else conservador.
  if (data?.thread_id) _tagsCache.delete(data.thread_id)
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

// Helper de compatibilidad (deprecated): preferir cleanup.getState() del
// retorno de subscribeThread. Lo dejamos por si algún caller externo lo usa.
export function getThreadChannelState(threadId) {
  if (!threadId) return null
  const channels = supabase.getChannels?.() || []
  const found = channels.find(c =>
    c.topic === `realtime:notes:thread:${threadId}` ||
    c.topic?.includes(`notes:thread:${threadId}`)
  )
  return found?.state || null
}

// Limpia las caches de módulo (tags + exercises). Llamar en SIGNED_OUT
// o cuando se cambia de cuenta para evitar fugas cross-sesión.
export function resetNotesCaches() {
  _tagsCache.clear()
  _exercisesCache = null
}

// ============================================================
// B.9 — listAvailableTags(threadId)
// ------------------------------------------------------------
// Devuelve string[] dedupeado y ordenado. Cache 60s por thread.
// ============================================================
export async function listAvailableTags(threadId) {
  if (!threadId) return { data: [], error: null }

  const cached = _tagsCache.get(threadId)
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.value, error: null }
  }

  const { data, error } = await supabase
    .from('notes')
    .select('tags')
    .eq('thread_id', threadId)
    .is('deleted_at', null)

  if (error) return { data: [], error: normalizeError(error, 'No se pudieron cargar los tags.') }

  const set = new Set()
  for (const row of data || []) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (t && typeof t === 'string') set.add(t)
      }
    }
  }
  const value = Array.from(set).sort((a, b) => a.localeCompare(b))
  _tagsCache.set(threadId, { value, expiresAt: Date.now() + TAGS_CACHE_TTL_MS })
  return { data: value, error: null }
}

// ============================================================
// B.10 — listExercisesForFilter()
// ------------------------------------------------------------
// Solo ejercicios activos. Cache módulo (5min) porque rara vez
// cambia y el panel puede montarse varias veces.
// ============================================================
export async function listExercisesForFilter() {
  if (_exercisesCache && _exercisesCache.expiresAt > Date.now()) {
    return { data: _exercisesCache.value, error: null }
  }
  // Columna correcta: is_active (renombrada por fix_5_1_5_3_exercises_cosmetic
  // antes de v24). El nombre 'active' nunca existió en producción.
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    // No cacheamos errores. Loggeamos sin tragar para diagnóstico.
    // eslint-disable-next-line no-console
    console.warn('[notes.listExercisesForFilter] error:', error)
    return { data: [], error: normalizeError(error, 'No se pudieron cargar los ejercicios.') }
  }
  _exercisesCache = { value: data || [], expiresAt: Date.now() + EXERCISES_CACHE_TTL_MS }
  return { data: data || [], error: null }
}

// ============================================================
// Helpers extra (no en spec pero útiles para los componentes)
// ============================================================

// Etiqueta legible para context_type. Si más adelante hay que
// resolver el nombre de un contexto (ej. nombre del ejercicio),
// el componente lo hace aparte vía exercise_id → listExercisesForFilter.
const CONTEXT_TYPE_LABELS = {
  free: 'Libre',
  workout_log: 'Registro',
  workout_block_log: 'Bloque registrado',
  plan_exercise: 'Ejercicio',
  evaluation_test: 'Evaluación',
  plan: 'Plan',
  session_day: 'Sesión',
}

export function contextTypeLabel(type) {
  return CONTEXT_TYPE_LABELS[type] || type || ''
}
