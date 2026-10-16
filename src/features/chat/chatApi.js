// ============================================================
// chatApi.js — acceso a datos del Chat (v75)
// ------------------------------------------------------------
// El chat usa el mismo hilo que las notas (note_threads/notes) más
// chat_events. Las copias al plan/ejercicio/día/privadas se crean con la
// RPC chat_link_note y se quitan con chat_unlink_note.
// Convención: { data, error }, nunca tira.
// ============================================================

import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const NOTE_FIELDS =
  'id, thread_id, author_id, author_role, body, visibility, context_type, context_id, exercise_id, parent_note_id, note_date, read_at_coach, read_at_student, created_at, updated_at, deleted_at, source_note_id, plan_id, plan_exercise_id, plan_section'

export const EVENT_FIELDS =
  'id, thread_id, student_id, kind, milestone_id, workout_log_id, workout_block_log_id, exercise_id, payload, occurred_at, created_at, read_at_coach, read_at_student'

async function safe(fn) {
  try {
    return { data: await fn(), error: null }
  } catch (error) {
    console.warn('[chatApi]', error)
    return { data: null, error }
  }
}

/** Personas de la coach (activas primero) con su hilo, si existe. */
export async function listCoachConversations(coachId) {
  return safe(async () => {
    const [{ data: people, error: e1 }, { data: threads, error: e2 }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, avatar_url, active, is_test, language')
        .eq('coach_id', coachId)
        .neq('id', coachId),
      supabase
        .from('note_threads')
        .select('id, student_id, last_message_at, unread_for_coach, created_at')
        .eq('coach_id', coachId),
    ])
    if (e1) throw e1
    if (e2) throw e2
    const byStudent = new Map((threads || []).map((t) => [t.student_id, t]))
    return (people || []).map((p) => ({ person: p, thread: byStudent.get(p.id) || null }))
  })
}

/** Últimos mensajes y eventos de varios hilos, para la vista previa de la lista. */
export async function fetchPreviews(threadIds = []) {
  if (!threadIds.length) return { data: { notes: [], events: [] }, error: null }
  return safe(async () => {
    const [{ data: notes, error: e1 }, { data: events, error: e2 }] = await Promise.all([
      supabase
        .from('notes')
        .select(
          'id, thread_id, author_role, body, visibility, context_type, exercise_id, created_at, deleted_at, source_note_id'
        )
        .in('thread_id', threadIds)
        .is('deleted_at', null)
        .is('source_note_id', null)
        .order('created_at', { ascending: false })
        .limit(600),
      supabase
        .from('chat_events')
        .select('id, thread_id, kind, payload, occurred_at, created_at')
        .in('thread_id', threadIds)
        .order('occurred_at', { ascending: false })
        .limit(300),
    ])
    if (e1) throw e1
    if (e2) throw e2
    return { notes: notes || [], events: events || [] }
  })
}

/** Todo el hilo: notas (con copias) y eventos. */
export async function fetchThreadContent(threadId) {
  return safe(async () => {
    const [notes, events] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('notes')
          .select(NOTE_FIELDS)
          .eq('thread_id', threadId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('chat_events')
          .select(EVENT_FIELDS)
          .eq('thread_id', threadId)
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ])
    return { notes, events }
  })
}

/** Bienestar de la persona entre dos fechas (YYYY-MM-DD, inclusivas). */
export async function fetchWellbeing(studentId, from, to) {
  return safe(async () => {
    const { data, error } = await supabase
      .from('wellbeing_logs')
      .select(
        'date, sleep_quality, nutrition_quality, hydration_quality, energy_level, stress_level, muscle_fatigue'
      )
      .eq('user_id', studentId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
    if (error) throw error
    return data || []
  })
}

/** Catálogo de ejercicios visible para quien pide (sin archivados ni fusionados). */
let _catalog = null
export async function fetchCatalog() {
  if (_catalog && _catalog.expires > Date.now()) return { data: _catalog.rows, error: null }
  return safe(async () => {
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('exercises')
        .select('id, name, i18n, archived_at, merged_into_id')
        .is('archived_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)
    )
    const out = rows.map((r) => ({ id: r.id, name: r.name, name_en: r.i18n?.en?.name || null }))
    _catalog = { rows: out, expires: Date.now() + 5 * 60_000 }
    return out
  })
}

/** Nombres de ejercicios por id (para etiquetar contextos). */
export async function fetchExerciseNames(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return { data: new Map(), error: null }
  return safe(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, i18n')
      .in('id', unique)
    if (error) throw error
    return new Map(
      (data || []).map((e) => [e.id, { name: e.name, name_en: e.i18n?.en?.name || null }])
    )
  })
}

/**
 * Plan de entrenamiento activo de la persona: id, título, días y ejercicios.
 * Si hay más de uno activo, todos (raro, pero posible con planes vinculados).
 */
export async function fetchActivePlans(studentId) {
  return safe(async () => {
    const { data: assigns, error } = await supabase
      .from('plan_assignments')
      .select('id, plan_id, plan_type, active, status, plans:plan_id(id, title, plan_type)')
      .eq('student_id', studentId)
      .eq('active', true)
    if (error) throw error
    const plans = (assigns || [])
      .map((a) => a.plans)
      .filter((p) => p && (p.plan_type || 'training') === 'training')
    if (!plans.length) return []
    const planIds = plans.map((p) => p.id)
    const { data: pes, error: e2 } = await supabase
      .from('plan_exercises')
      .select('id, plan_id, section, exercise_id, order_index')
      .in('plan_id', planIds)
      .order('order_index', { ascending: true })
    if (e2) throw e2
    return plans.map((p) => {
      const exercises = (pes || []).filter((pe) => pe.plan_id === p.id)
      const sections = [...new Set(exercises.map((pe) => pe.section))]
        .filter((s) => /^day_/.test(s))
        .sort()
      return { ...p, exercises, sections }
    })
  })
}

/** Datos para etiquetar las copias de plan (título y día). */
export async function fetchPlanTitles(planIds = []) {
  const unique = [...new Set(planIds.filter(Boolean))]
  if (!unique.length) return { data: new Map(), error: null }
  return safe(async () => {
    const { data, error } = await supabase.from('plans').select('id, title').in('id', unique)
    if (error) throw error
    return new Map((data || []).map((p) => [p.id, p.title]))
  })
}

export async function fetchPlanExerciseSections(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return { data: new Map(), error: null }
  return safe(async () => {
    const { data, error } = await supabase
      .from('plan_exercises')
      .select('id, section, plan_id')
      .in('id', unique)
    if (error) throw error
    return new Map((data || []).map((p) => [p.id, p]))
  })
}

export async function linkNote({ sourceNoteId, target, refId = null, section = null }) {
  const { data, error } = await supabase.rpc('chat_link_note', {
    p_source_note_id: sourceNoteId,
    p_target: target,
    p_ref_id: refId,
    p_section: section,
  })
  return { data: data ?? null, error }
}

export async function unlinkNote(copyId) {
  const { error } = await supabase.rpc('chat_unlink_note', { p_copy_id: copyId })
  return { data: !error, error }
}

/** Realtime: notas y eventos del hilo. onChange({ table, event, new, old }). */
export function subscribeChat(threadId, onChange) {
  if (!threadId) return () => {}
  const channel = supabase
    .channel(`chat:${threadId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes', filter: `thread_id=eq.${threadId}` },
      (p) =>
        onChange({ table: 'notes', event: p.eventType, new: p.new || null, old: p.old || null })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_events', filter: `thread_id=eq.${threadId}` },
      (p) =>
        onChange({
          table: 'chat_events',
          event: p.eventType,
          new: p.new || null,
          old: p.old || null,
        })
    )
    .subscribe()
  return () => {
    try {
      supabase.removeChannel(channel)
    } catch {
      /* nada */
    }
  }
}

/** Realtime de los hilos de la coach (para la lista y el número de la barra). */
export function subscribeCoachThreads(coachId, onChange, tag = 'list') {
  if (!coachId) return () => {}
  const channel = supabase
    .channel(`chat-threads:${tag}:${coachId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'note_threads', filter: `coach_id=eq.${coachId}` },
      () => onChange()
    )
    .subscribe()
  return () => {
    try {
      supabase.removeChannel(channel)
    } catch {
      /* nada */
    }
  }
}
