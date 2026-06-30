// ============================================================
// activities/api.js — Data layer de "actividades extra por día"
// ------------------------------------------------------------
// Registro de actividades NO vinculadas al entrenamiento (fútbol,
// yoga, running, etc.), por (alumno, fecha), N por día. Doc 55.
//
// Tabla: public.activity_logs (RLS: alumno CRUD propio, coach todo).
// No hay RPCs: acceso directo con supabase.from('activity_logs').
//
// Convención: las funciones async devuelven { data, error }, nunca
// tiran. Los helpers (catálogo/validación/payload) son puros y
// testeables sin Supabase.
// ============================================================

import { supabase } from '@/lib/supabase'

// ── Catálogo de tipos de actividad ────────────────────────────
// `key` matchea el enum public.activity_type. `i18n` es la clave de
// traducción bajo activities.types.*. `emoji` para los chips del UI.
// `sport_other` y `other` exigen `label` (texto libre).
export const ACTIVITY_TYPES = [
  { key: 'football', i18n: 'activities.types.football', emoji: '⚽' },
  { key: 'yoga', i18n: 'activities.types.yoga', emoji: '🧘' },
  { key: 'running', i18n: 'activities.types.running', emoji: '🏃' },
  { key: 'swimming', i18n: 'activities.types.swimming', emoji: '🏊' },
  { key: 'cycling', i18n: 'activities.types.cycling', emoji: '🚴' },
  { key: 'pilates', i18n: 'activities.types.pilates', emoji: '🤸' },
  { key: 'hiking', i18n: 'activities.types.hiking', emoji: '🥾' },
  { key: 'sport_other', i18n: 'activities.types.sport_other', emoji: '🏅' },
  { key: 'other', i18n: 'activities.types.other', emoji: '✨' },
]

const ACTIVITY_TYPE_KEYS = ACTIVITY_TYPES.map((t) => t.key)
const FREE_TEXT_TYPES = new Set(['sport_other', 'other'])

// ── Helpers puros ─────────────────────────────────────────────

// ¿Este tipo requiere que el alumno escriba un nombre libre?
export function requiresLabel(activityType) {
  return FREE_TEXT_TYPES.has(activityType)
}

// Devuelve la metadata del catálogo para un tipo dado (o null).
export function getActivityTypeMeta(activityType) {
  return ACTIVITY_TYPES.find((t) => t.key === activityType) || null
}

// Valida un borrador de actividad. Devuelve una clave de error i18n
// (string) o null si es válido.
export function validateActivityDraft(draft) {
  if (!draft || !draft.activity_type) return 'activities.errors.typeRequired'
  if (!ACTIVITY_TYPE_KEYS.includes(draft.activity_type)) return 'activities.errors.typeInvalid'
  if (requiresLabel(draft.activity_type) && !String(draft.label || '').trim())
    return 'activities.errors.labelRequired'
  if (
    draft.duration_min != null &&
    (Number(draft.duration_min) < 1 || Number(draft.duration_min) > 1440)
  )
    return 'activities.errors.durationRange'
  if (draft.intensity != null && (Number(draft.intensity) < 1 || Number(draft.intensity) > 10))
    return 'activities.errors.intensityRange'
  return null
}

// Normaliza valores numéricos opcionales: '' / undefined → null.
function optInt(v) {
  if (v === '' || v === undefined || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// Arma la fila lista para INSERT a partir de un borrador + contexto.
// `source` = 'student' o 'coach' según quién carga. Puro/testeable.
export function buildActivityPayload({ draft, studentId, userId, date, source = 'student' }) {
  const label = requiresLabel(draft.activity_type)
    ? String(draft.label || '').trim()
    : draft.label
      ? String(draft.label).trim()
      : null
  return {
    student_id: studentId,
    date,
    activity_type: draft.activity_type,
    label,
    duration_min: optInt(draft.duration_min),
    intensity: optInt(draft.intensity),
    notes: draft.notes ? String(draft.notes).trim() : null,
    source,
    created_by: userId,
  }
}

function normalizeError(rawError) {
  if (!rawError) return null
  return {
    code: rawError.code || null,
    message: rawError.message || 'Error desconocido',
    details: rawError.details || null,
    raw: rawError,
  }
}

// ── Acceso a datos ────────────────────────────────────────────

// Lista las actividades de un alumno en un rango [from, to] (YYYY-MM-DD,
// ambos inclusive). Ordenadas por fecha desc, creación desc.
export async function listActivities(studentId, { from, to } = {}) {
  let q = supabase
    .from('activity_logs')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (from) q = q.gte('date', from)
  if (to) q = q.lte('date', to)
  const { data, error } = await q
  return { data: data || [], error: normalizeError(error) }
}

// Lista las actividades de un alumno en una fecha puntual.
export async function listActivitiesForDay(studentId, date) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('student_id', studentId)
    .eq('date', date)
    .order('created_at', { ascending: false })
  return { data: data || [], error: normalizeError(error) }
}

// Crea una actividad. `payload` viene de buildActivityPayload.
export async function createActivity(payload) {
  const { data, error } = await supabase.from('activity_logs').insert(payload).select().single()
  return { data: data || null, error: normalizeError(error) }
}

// Actualiza campos editables de una actividad existente.
export async function updateActivity(id, patch) {
  const allowed = ['activity_type', 'label', 'duration_min', 'intensity', 'notes', 'date']
  const clean = {}
  for (const k of allowed) if (k in patch) clean[k] = patch[k]
  const { data, error } = await supabase
    .from('activity_logs')
    .update(clean)
    .eq('id', id)
    .select()
    .single()
  return { data: data || null, error: normalizeError(error) }
}

// Borra una actividad (hard delete; no es dato crítico).
export async function deleteActivity(id) {
  const { error } = await supabase.from('activity_logs').delete().eq('id', id)
  return { error: normalizeError(error) }
}
